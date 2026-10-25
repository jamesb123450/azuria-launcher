import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { gameVersions, type GameVersion } from "../lib/game-versions";
import { resolveLoaderVersion } from "../lib/loader-versions";
import { useLauncher } from "./launcher";
import { instanceApi } from "../instance-api";
import type { Instance } from "../types";
export type QuickLoader = "vanilla" | "fabric";
const key = "azuria-quick-play-v1",
  validVersion = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/;
interface Saved {
  version: string;
  loader: QuickLoader;
  setups: Record<string, string>;
  profileId?: string;
}
function read(): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      version:
        typeof data.version === "string" && validVersion.test(data.version)
          ? data.version
          : "",
      loader: data.loader === "fabric" ? "fabric" : "vanilla",
      profileId: typeof data.profileId === "string" ? data.profileId : "",
      setups: Object.fromEntries(
        Object.entries(data.setups ?? {}).filter(
          ([k, v]) =>
            /^(vanilla|fabric):[a-zA-Z0-9._-]+$/.test(k) &&
            typeof v === "string",
        ),
      ) as Record<string, string>,
    };
  } catch {
    return { version: "", loader: "vanilla", setups: {} };
  }
}
export const useQuickPlay = defineStore("quick-play", () => {
  const saved = reactive(read()),
    version = ref(saved.version),
    loader = ref<QuickLoader>(saved.loader);
  const versions = ref<GameVersion[]>([]),
    loading = ref(false),
    error = ref(""),
    preparing = ref(false),
    storageError = ref("");
  const launcher = useLauncher();
  let pending: Promise<void> | undefined,
    creation: Promise<Instance> | undefined;
  const selectionKey = computed(() => `${loader.value}:${version.value}`);
  const setup = computed(() => {
    const item = launcher.instances.find(
      (i) => i.id === (saved.profileId || saved.setups[selectionKey.value]),
    );
    return item?.minecraftVersion === version.value &&
      item.loader === loader.value
      ? item
      : undefined;
  });
  function persist() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...saved,
          version: version.value,
          loader: loader.value,
        }),
      );
      storageError.value = "";
    } catch {
      storageError.value =
        "Your launch choice could not be saved. It will last until Azuria closes.";
    }
  }
  function choose(game: string, modLoader: QuickLoader = loader.value) {
    if (
      !validVersion.test(game) ||
      !["vanilla", "fabric"].includes(modLoader) ||
      preparing.value
    )
      return;
    saved.profileId = "";
    version.value = game;
    loader.value = modLoader;
    error.value = "";
    persist();
  }
  function adoptSetup(item: Instance) {
    if (
      !["vanilla", "fabric"].includes(item.loader) ||
      !validVersion.test(item.minecraftVersion) ||
      preparing.value
    )
      return;
    saved.profileId = item.id;
    version.value = item.minecraftVersion;
    loader.value = item.loader as QuickLoader;
    persist();
  }
  async function load() {
    if (pending) return pending;
    if (versions.value.length) return;
    loading.value = true;
    error.value = "";
    pending = (async () => {
      try {
        versions.value = await gameVersions();
        if (!version.value) {
          version.value =
            versions.value.find((v) => v.type === "release")?.id ?? "";
          persist();
        }
      } catch {
        error.value =
          "Couldn’t load Minecraft versions. Try again or enter a version manually.";
      } finally {
        loading.value = false;
        pending = undefined;
      }
    })();
    return pending;
  }
  // Reuse only IDs created here, never a user's custom setup with matching metadata.
  async function ensureSetup(): Promise<Instance> {
    if (creation) return creation;
    if (setup.value) return setup.value;
    if (saved.profileId)
      throw new Error(
        "Your selected profile changed or is no longer available. Choose a profile or Minecraft version again.",
      );
    if (!launcher.libraryReady || launcher.loading || launcher.busy)
      throw new Error(
        "Your saved setups are not ready. Retry loading them before launching.",
      );
    if (!validVersion.test(version.value))
      throw new Error("Choose a Minecraft version first.");
    const game = version.value,
      modLoader = loader.value,
      identity = selectionKey.value;
    preparing.value = true;
    error.value = "";
    creation = (async () => {
      const loaderVersion =
        modLoader === "fabric"
          ? await resolveLoaderVersion("fabric", game, "stable")
          : null;
      const defaults = await instanceApi.defaults();
      const item = await launcher.save(
        {
          name: `Minecraft ${game} · ${modLoader === "fabric" ? "Fabric" : "Vanilla"}`,
          minecraftVersion: game,
          loader: modLoader,
          memoryMb: defaults.memoryMb,
          loaderVersion,
          icon: null,
        },
        undefined,
        false,
      );
      if (!item)
        throw new Error(
          launcher.saveError || "Couldn’t create this setup. Try again.",
        );
      saved.setups[identity] = item.id;
      launcher.selectedId = item.id;
      persist();
      return item;
    })().finally(() => {
      creation = undefined;
      preparing.value = false;
    });
    return creation;
  }
  return {
    version,
    loader,
    versions,
    loading,
    error,
    preparing,
    storageError,
    setup,
    profileSelected: computed(() =>
      Boolean(setup.value && saved.profileId === setup.value.id),
    ),
    choose,
    load,
    ensureSetup,
    adoptSetup,
  };
});

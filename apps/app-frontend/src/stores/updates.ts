import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { desktop } from "../api";
export const useUpdates = defineStore("updates", () => {
  const version = ref("0.2.1");
  const update = shallowRef<Update | null>(null);
  const status = ref<
    | "idle"
    | "checking"
    | "current"
    | "downloading"
    | "verifying"
    | "ready"
    | "installing"
    | "error"
  >("idle");
  const error = ref("");
  const received = ref(0);
  const total = ref<number>();
  const deferred = ref(false);
  let initialized = false;
  const busy = computed(() =>
    ["checking", "downloading", "verifying", "installing"].includes(
      status.value,
    ),
  );
  const progress = computed(() =>
    total.value
      ? Math.min(100, Math.round((received.value / total.value) * 100))
      : undefined,
  );
  async function download() {
    if (!desktop || busy.value || !update.value) return;
    error.value = "";
    received.value = 0;
    total.value = undefined;
    status.value = "downloading";
    try {
      await update.value.download(
        (event) => {
          if (event.event === "Started") total.value = event.data.contentLength;
          if (event.event === "Progress")
            received.value += event.data.chunkLength;
          if (event.event === "Finished") status.value = "verifying";
        },
        { timeout: 120000 },
      );
      status.value = "ready";
    } catch {
      status.value = "error";
      error.value =
        "The update could not be downloaded or verified. Your current installation is still available. Retry when your connection is ready.";
    }
  }
  async function checkNow() {
    if (!desktop || busy.value) return;
    status.value = "checking";
    error.value = "";
    deferred.value = false;
    try {
      const previous = update.value;
      update.value = null;
      if (previous) await previous.close();
      update.value = await check({ timeout: 15000 });
      status.value = update.value ? "idle" : "current";
      if (update.value) await download();
    } catch {
      status.value = "error";
      error.value =
        "Could not reach the update feed. It may not be published yet, or your connection may be unavailable. Azuria will check again next time it opens.";
    }
  }
  async function init() {
    if (!desktop || initialized) return;
    initialized = true;
    try {
      version.value = await getVersion();
    } catch {
      /* Keep bundled version. */
    }
    await checkNow();
  }
  async function install() {
    if (!desktop || busy.value || !update.value || status.value !== "ready")
      return;
    error.value = "";
    status.value = "installing";
    try {
      const games = await invoke<Array<{ stage: string }>>("game_launches");
      if (
        games.some(
          (game) =>
            !["exited", "crashed", "error", "cancelled"].includes(game.stage),
        )
      ) {
        status.value = "ready";
        deferred.value = true;
        error.value =
          "Close Minecraft or cancel game preparation before installing an update.";
        return;
      }
      await update.value.install({ restartAfterInstall: true });
    } catch {
      status.value = "error";
      error.value =
        "The installer could not start. Keep using this version and retry the update.";
    }
  }
  function defer() {
    if (status.value === "ready") deferred.value = true;
  }
  return {
    version,
    update,
    status,
    error,
    received,
    total,
    busy,
    progress,
    deferred,
    checkNow,
    init,
    install,
    defer,
  };
});

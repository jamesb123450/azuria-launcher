import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { desktop } from "../api";

export const useUpdates = defineStore("updates", () => {
  const version = ref("0.2.0");
  const update = shallowRef<Update | null>(null);
  const status = ref<
    | "idle"
    | "checking"
    | "available"
    | "current"
    | "downloading"
    | "installing"
    | "error"
  >("idle");
  const error = ref("");
  const received = ref(0);
  const total = ref<number>();
  const busy = computed(() =>
    ["checking", "downloading", "installing"].includes(status.value),
  );
  const progress = computed(() =>
    total.value
      ? Math.min(100, Math.round((received.value / total.value) * 100))
      : undefined,
  );
  async function checkNow() {
    if (!desktop || busy.value) return;
    status.value = "checking";
    error.value = "";
    try {
      const previous = update.value;
      update.value = null;
      if (previous) await previous.close();
      update.value = await check({ timeout: 15000 });
      status.value = update.value ? "available" : "current";
    } catch {
      status.value = "error";
      error.value =
        "Could not reach the update feed. It may not be published yet, or your connection may be unavailable. Try again later.";
    }
  }
  async function init() {
    if (!desktop) return;
    try {
      version.value = await getVersion();
    } catch {
      /* Keep bundled version. */
    }
    await checkNow();
  }
  async function install() {
    if (!desktop || busy.value || !update.value) return;
    const selected = update.value;
    error.value = "";
    received.value = 0;
    total.value = undefined;
    status.value = "downloading";
    try {
      await selected.download(
        (event) => {
          if (event.event === "Started") total.value = event.data.contentLength;
          if (event.event === "Progress")
            received.value += event.data.chunkLength;
        },
        { timeout: 120000 },
      );
      status.value = "installing";
      await selected.install({ restartAfterInstall: true });
    } catch {
      status.value = "error";
      error.value =
        "The update could not be downloaded, verified or installed. Your current installation is still available. Retry the update or check again.";
    }
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
    checkNow,
    init,
    install,
  };
});

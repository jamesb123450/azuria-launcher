import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api";
import { contentApi, type ContentJob } from "../content-api";
import { useLauncher } from "./launcher";
export const useContent = defineStore("content", () => {
  const job = ref<ContentJob | null>(null);
  const error = ref("");
  let initialized = false;
  const busy = computed(
    () =>
      !!job.value &&
      !["installed", "error", "cancelled"].includes(job.value.stage),
  );
  async function init() {
    if (!desktop || initialized) return;
    initialized = true;
    try {
      await listen<ContentJob>("content-progress", ({ payload }) => {
        job.value = payload;
      });
      await listen("content-installed", () => {
        void useLauncher().init();
      });
      const current = await contentApi.job();
      if (!job.value) job.value = current;
    } catch {
      error.value =
        "Could not connect to content installation status. Restart Azuria.";
      initialized = false;
    }
  }
  async function install(id: string) {
    error.value = "";
    try {
      await contentApi.install(id);
    } catch (e) {
      error.value = String(e);
    }
  }
  async function cancel() {
    try {
      await contentApi.cancel();
    } catch (e) {
      error.value = String(e);
    }
  }
  return { job, error, busy, init, install, cancel };
});

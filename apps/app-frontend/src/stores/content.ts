import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api";
import { contentApi, type ContentJob, type Provider } from "../content-api";
import { useLauncher } from "./launcher";
export const useContent = defineStore("content", () => {
  const job = ref<ContentJob | null>(null);
  const error = ref("");
  let initialized = false;
  const batchActive = ref(false),
    batchStopped = ref(false),
    batchName = ref("");
  const batchResult = ref(""),
    batchInstance = ref("");
  let activePlan = "";
  const terminal = (stage: string) =>
    ["installed", "error", "cancelled"].includes(stage);
  function accept(value: ContentJob) {
    job.value =
      batchActive.value && batchName.value && value.id === activePlan
        ? { ...value, message: `${batchName.value}: ${value.message}` }
        : value;
  }
  const busy = computed(
    () => batchActive.value || (!!job.value && !terminal(job.value.stage)),
  );
  async function init() {
    if (!desktop || initialized) return;
    initialized = true;
    try {
      await listen<ContentJob>("content-progress", ({ payload }) => {
        accept(payload);
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
    if (batchActive.value) {
      error.value = "Wait for the current updates to finish.";
      return;
    }
    try {
      await contentApi.install(id);
    } catch (e) {
      error.value = String(e);
    }
  }
  async function cancel() {
    if (batchActive.value) batchStopped.value = true;
    try {
      if (
        !batchActive.value ||
        (activePlan &&
          job.value?.id === activePlan &&
          !terminal(job.value.stage))
      )
        await contentApi.cancel();
    } catch (e) {
      error.value = String(e);
    }
  }
  async function updateBatch(
    id: string,
    updates: {
      provider: Provider;
      project: string;
      version: string;
      name: string;
    }[],
  ) {
    if (busy.value || !updates.length) return;
    batchResult.value = "";
    batchInstance.value = id;
    batchActive.value = true;
    batchStopped.value = false;
    error.value = "";
    let completed = 0;
    try {
      for (const update of updates) {
        if (batchStopped.value) break;
        batchName.value = update.name;
        const plan = await contentApi.updatePlan(
          id,
          update.provider,
          update.project,
          update.version,
        );
        if (batchStopped.value) break;
        activePlan = plan.id;
        await contentApi.install(plan.id);
        const deadline = Date.now() + 30 * 60 * 1000;
        while (true) {
          const status = await contentApi.job();
          if (status?.id === plan.id) {
            accept(status);
            if (status.stage === "installed") {
              completed++;
              break;
            }
            if (status.stage === "error") throw Error(status.message);
            if (status.stage === "cancelled") {
              batchStopped.value = true;
              break;
            }
          }
          if (Date.now() > deadline)
            throw Error(
              "The update is taking longer than expected. Check Tasks before retrying.",
            );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        activePlan = "";
      }
      batchResult.value = batchStopped.value
        ? `Updates stopped. ${completed} of ${updates.length} finished.`
        : `${completed} ${completed === 1 ? "project updated" : "projects updated"}.`;
      useLauncher().notice = batchResult.value;
    } catch (e) {
      error.value = `Updates stopped after ${completed} of ${updates.length}: ${String(e)}`;
    } finally {
      batchActive.value = false;
      batchName.value = "";
      activePlan = "";
      void useLauncher().init();
    }
  }
  return {
    job,
    error,
    busy,
    batchActive,
    batchStopped,
    batchResult,
    batchInstance,
    init,
    install,
    cancel,
    updateBatch,
  };
});

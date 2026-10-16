import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api";
export interface GameLaunch {
  id: string;
  stage: string;
  message: string;
  completed: number;
  total: number;
  exitCode: number | null;
}
export const terminalStages = ["exited", "crashed", "error", "cancelled"];
export const useGame = defineStore("game", () => {
  const launches = ref<Record<string, GameLaunch>>({});
  const error = ref("");
  const ready = ref(false);
  let initialized = false;
  const active = computed(() =>
    Object.values(launches.value).filter(
      (l) => !terminalStages.includes(l.stage),
    ),
  );
  function update(value: GameLaunch) {
    launches.value = { ...launches.value, [value.id]: value };
  }
  async function init() {
    if (!desktop || initialized) return;
    initialized = true;
    try {
      await listen<GameLaunch>("game-progress", ({ payload }) =>
        update(payload),
      );
      await listen("game-close-blocked", () => {
        error.value =
          "Close Minecraft or cancel preparation before closing Azuria. This keeps game monitoring and instance protection active.";
      });
      const current = await invoke<GameLaunch[]>("game_launches");
      for (const launch of current)
        if (!launches.value[launch.id]) update(launch);
      ready.value = true;
    } catch {
      error.value =
        "Could not connect to game status. Restart Azuria before launching.";
    }
  }
  async function launch(id: string) {
    if (!desktop) return;
    error.value = "";
    if (!ready.value) {
      error.value =
        "Game status is not ready. Wait a moment or restart Azuria.";
      return;
    }
    if (
      launches.value[id] &&
      !terminalStages.includes(launches.value[id]!.stage)
    )
      return;
    update({
      id,
      stage: "queued",
      message: "Preparing Minecraft…",
      completed: 0,
      total: 0,
      exitCode: null,
    });
    try {
      await invoke("launch_instance", { id });
    } catch (e) {
      update({
        id,
        stage: "error",
        message:
          typeof e === "string"
            ? e
            : "Could not start Minecraft. Retry from this instance.",
        completed: 0,
        total: 0,
        exitCode: null,
      });
    }
  }
  async function cancel(id: string) {
    try {
      await invoke("cancel_launch", { id });
    } catch (e) {
      error.value = String(e);
    }
  }
  return { launches, active, ready, error, init, launch, cancel };
});

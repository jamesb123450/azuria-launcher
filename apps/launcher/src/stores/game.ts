import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../api";
import { useLauncher } from "./launcher";
import type { Instance } from "../types";
export interface GameLaunch {
  id: string;
  stage: string;
  message: string;
  completed: number;
  total: number;
  exitCode: number | null;
  prepareOnly?: boolean;
}
export const terminalStages = [
  "exited",
  "crashed",
  "error",
  "cancelled",
  "prepared",
];
export const useGame = defineStore("game", () => {
  const launches = ref<Record<string, GameLaunch>>({});
  const error = ref("");
  const stopping = ref<Record<string, boolean>>({});
  const ready = ref(false);
  let initialized = false;
  const active = computed(() =>
    Object.values(launches.value).filter(
      (l) => !terminalStages.includes(l.stage),
    ),
  );
  function update(value: GameLaunch) {
    launches.value = { ...launches.value, [value.id]: value };
    if (terminalStages.includes(value.stage)) stopping.value[value.id] = false;
  }
  async function init() {
    if (!desktop || initialized) return;
    initialized = true;
    try {
      await listen<GameLaunch>("game-progress", ({ payload }) =>
        update(payload),
      );
      await listen<Instance>("instance-updated", ({ payload }) => {
        const launcher = useLauncher();
        launcher.instances = launcher.instances.map((item) =>
          item.id === payload.id ? payload : item,
        );
      });
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
  async function start(id: string, prepareOnly: boolean) {
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
      prepareOnly,
      message: prepareOnly
        ? "Downloading Minecraft files…"
        : "Preparing Minecraft…",
      completed: 0,
      total: 0,
      exitCode: null,
    });
    try {
      await invoke(prepareOnly ? "prepare_instance" : "launch_instance", {
        id,
      });
    } catch (e) {
      update({
        id,
        stage: "error",
        prepareOnly,
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
  const launch = (id: string) => start(id, false);
  const prepare = (id: string) => start(id, true);
  async function cancel(id: string) {
    stopping.value[id] = true;
    try {
      await invoke("cancel_launch", { id });
    } catch (e) {
      stopping.value[id] = false;
      error.value = String(e);
    }
  }
  return {
    launches,
    active,
    ready,
    error,
    stopping,
    init,
    launch,
    prepare,
    cancel,
  };
});

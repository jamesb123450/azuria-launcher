import { invoke } from "@tauri-apps/api/core";
import type { Router } from "vue-router";
import { desktop } from "./api";
export async function openMonitor(id: string, router: Router) {
  if (desktop) await invoke("open_game_monitor", { id });
  else await router.push(`/monitor/${encodeURIComponent(id)}`);
}

// Do not start Minecraft if its monitor failed to open.
export async function launchMonitored(
  id: string,
  router: Router,
  start: (id: string) => Promise<void>,
) {
  await openMonitor(id, router);
  await start(id);
}

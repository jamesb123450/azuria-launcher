import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export interface Behaviour {
  minimiseOnStart: boolean;
  refocusOnExit: boolean;
  hideRightSidebar: boolean;
  compactLibrary: boolean;
  discordPresence: boolean;
}
export const defaultBehaviour = (): Behaviour => ({
  minimiseOnStart: false,
  refocusOnExit: false,
  hideRightSidebar: false,
  compactLibrary: false,
  discordPresence: true,
});
export function parseBehaviour(value: unknown): Behaviour {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Behaviour settings are unavailable. Retry loading them.");
  const result = defaultBehaviour();
  for (const key of Object.keys(result) as (keyof Behaviour)[]) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== undefined) {
      if (typeof field !== "boolean")
        throw new Error(
          "Invalid behaviour settings. Your saved preferences were not changed.",
        );
      result[key] = field;
    }
  }
  return result;
}
const key = "azuria-behaviour-v1";
export const behaviourApi = {
  load: async (): Promise<Behaviour> =>
    parseBehaviour(
      desktop
        ? await invoke("get_behaviour")
        : JSON.parse(localStorage.getItem(key) || "{}"),
    ),
  save: async (options: Behaviour) => {
    const checked = parseBehaviour(options);
    if (desktop) await invoke("save_behaviour", { options: checked });
    else localStorage.setItem(key, JSON.stringify(checked));
  },
};

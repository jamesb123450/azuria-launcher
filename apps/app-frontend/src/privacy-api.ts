import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export interface Privacy {
  restoreAccount: boolean;
  hideAccount: boolean;
}
export const defaultPrivacy = (): Privacy => ({
  restoreAccount: true,
  hideAccount: false,
});
export function parsePrivacy(value: unknown): Privacy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Privacy preferences could not be read.");
  const result = defaultPrivacy();
  for (const key of Object.keys(result) as (keyof Privacy)[]) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== undefined) {
      if (typeof field !== "boolean")
        throw Error("Invalid privacy preference.");
      result[key] = field;
    }
  }
  return result;
}
export const privacyApi = {
  async get(): Promise<Privacy> {
    const raw = desktop
      ? await invoke("get_privacy")
      : JSON.parse(localStorage.getItem("azuria-privacy-v1") ?? "{}");
    return parsePrivacy(raw);
  },
  async save(options: Privacy) {
    const value = parsePrivacy(options);
    if (desktop) await invoke("save_privacy", { options: value });
    else localStorage.setItem("azuria-privacy-v1", JSON.stringify(value));
  },
};

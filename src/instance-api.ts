import { invoke } from "@tauri-apps/api/core";
import { api, desktop } from "./api";
import type { Instance } from "./types";
import {
  defaultLaunchOptions,
  validateOptions,
  effectiveOptions,
  type LaunchOptions,
  type LaunchOverrides,
} from "./lib/launch-options";
export type Section =
  "mods" | "resourcePacks" | "shaderPacks" | "worlds" | "logs" | "root";
export interface FileEntry {
  name: string;
  size: number;
  enabled: boolean;
  directory: boolean;
}
function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}
const prefKey = (id: string) => `azuria-instance-options-${id}`;
export const instanceApi = {
  defaults: async (): Promise<LaunchOptions> =>
    desktop
      ? invoke("get_launch_defaults")
      : load("azuria-launch-defaults", defaultLaunchOptions()),
  saveDefaults: async (options: LaunchOptions): Promise<void> => {
    const e = validateOptions(options);
    if (e) throw Error(e);
    if (desktop) return invoke("save_launch_defaults", { options });
    localStorage.setItem("azuria-launch-defaults", JSON.stringify(options));
  },
  overrides: async (id: string): Promise<LaunchOverrides> =>
    desktop
      ? invoke("get_instance_overrides", { id })
      : load(prefKey(id), {
          memoryMb:
            (await api.list()).find((i) => i.id === id)?.memoryMb ?? 4096,
        }),
  saveOverrides: async (
    id: string,
    options: LaunchOverrides,
  ): Promise<void> => {
    const e = validateOptions(
      effectiveOptions(await instanceApi.defaults(), options),
    );
    if (e) throw Error(e);
    if (desktop) return invoke("save_instance_overrides", { id, options });
    localStorage.setItem(prefKey(id), JSON.stringify(options));
  },
  entries: async (id: string, section: Section): Promise<FileEntry[]> =>
    desktop ? invoke("instance_entries", { id, section }) : [],
  toggle: async (id: string, section: Section, name: string): Promise<void> => {
    if (desktop)
      return invoke("toggle_instance_content", { id, section, name });
  },
  remove: async (id: string, section: Section, name: string): Promise<void> => {
    if (desktop)
      return invoke("remove_instance_content", { id, section, name });
  },
  import: async (id: string, section: Section): Promise<void> => {
    if (desktop) return invoke("import_instance_content", { id, section });
  },
  open: async (
    id: string,
    section: Section = "root",
    name?: string,
  ): Promise<void> => {
    if (desktop)
      return invoke("open_instance_directory", {
        id,
        section,
        name: name ?? null,
      });
  },
  log: async (id: string, name: string): Promise<string> =>
    desktop ? invoke("instance_log", { id, name }) : "",
  browseJava: async (): Promise<string | null> =>
    desktop ? invoke("browse_java") : null,
  detectJava: async (): Promise<string[]> =>
    desktop ? invoke("detect_java") : [],
  duplicate: async (
    item: Instance,
    includeFiles: boolean,
  ): Promise<Instance> => {
    if (desktop)
      return invoke("duplicate_instance", { id: item.id, includeFiles });
    const copy = await api.create({
      ...item,
      name: `${item.name.slice(0, 74)} copy`,
    });
    await instanceApi.saveOverrides(
      copy.id,
      await instanceApi.overrides(item.id),
    );
    return copy;
  },
};

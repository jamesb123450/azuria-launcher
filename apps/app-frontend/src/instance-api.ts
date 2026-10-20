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
  | "mods"
  | "resourcePacks"
  | "shaderPacks"
  | "worlds"
  | "logs"
  | "screenshots"
  | "root";
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
  directory: async (id: string): Promise<string | null> =>
    desktop ? invoke("instance_directory", { id }) : null,
  notes: async (id: string): Promise<string> =>
    desktop
      ? invoke("get_instance_notes", { id })
      : (localStorage.getItem(`azuria-instance-notes-${id}`) ?? ""),
  saveNotes: async (id: string, text: string): Promise<void> => {
    if (new TextEncoder().encode(text).length > 65536)
      throw Error("Keep instance notes within 64 KB.");
    if (desktop) return invoke("save_instance_notes", { id, text });
    localStorage.setItem(`azuria-instance-notes-${id}`, text);
  },
  openNotes: async (id: string): Promise<void> => {
    if (desktop) return invoke("open_instance_notes_directory", { id });
  },
  export: async (
    item: Instance,
    format: "azuria" | "folder",
  ): Promise<string | null> => {
    if (desktop) return invoke("export_instance", { id: item.id, format });
    if (format === "folder")
      throw Error("Folder export is available in the Windows app.");
    const overrides = await instanceApi.overrides(item.id);
    const data = {
      format: "azuria-setup",
      formatVersion: 1,
      instance: item,
      overrides: { memoryMb: overrides.memoryMb, window: overrides.window },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "azuria-setup.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return "azuria-setup.json";
  },
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

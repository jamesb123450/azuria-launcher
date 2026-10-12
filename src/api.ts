import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Instance, InstanceInput, Settings } from "./types";
import { validateInput } from "./types";
export const desktop = isTauri();
// Browser preview is isolated from the real desktop database and never launches Minecraft.
const previewKey = "azuria-preview-v1";
interface Preview {
  instances: Instance[];
  settings: Settings;
}
function read(): Preview {
  const raw = localStorage.getItem(previewKey);
  if (!raw) return { instances: [], settings: { theme: "system" } };
  const value = JSON.parse(raw) as Preview;
  if (
    !Array.isArray(value.instances) ||
    !["system", "dark", "light"].includes(value.settings?.theme)
  )
    throw new Error(
      "Preview storage is invalid. Clear this site’s storage to reset it.",
    );
  return value;
}
function write(value: Preview) {
  localStorage.setItem(previewKey, JSON.stringify(value));
}
export const api = {
  list: async (): Promise<Instance[]> =>
    desktop ? invoke("list_instances") : read().instances,
  create: async (input: InstanceInput): Promise<Instance> => {
    if (desktop) return invoke("create_instance", { input });
    const error = validateInput(input);
    if (error) throw new Error(error);
    const value = read();
    const instance: Instance = {
      ...input,
      name: input.name.trim(),
      id: crypto.randomUUID(),
      favorite: false,
      createdAt: Date.now(),
    };
    value.instances.push(instance);
    write(value);
    return instance;
  },
  update: async (id: string, input: InstanceInput): Promise<Instance> => {
    if (desktop) return invoke("update_instance", { id, input });
    const error = validateInput(input);
    if (error) throw new Error(error);
    const value = read();
    const index = value.instances.findIndex((i) => i.id === id);
    if (index < 0) throw new Error("Instance no longer exists.");
    value.instances[index] = {
      ...value.instances[index]!,
      ...input,
      name: input.name.trim(),
    };
    write(value);
    return value.instances[index]!;
  },
  favorite: async (id: string): Promise<Instance> => {
    if (desktop) return invoke("toggle_favorite", { id });
    const value = read();
    const item = value.instances.find((i) => i.id === id);
    if (!item) throw new Error("Instance no longer exists.");
    item.favorite = !item.favorite;
    write(value);
    return item;
  },
  remove: async (id: string): Promise<void> => {
    if (desktop) return invoke("delete_instance", { id });
    const value = read();
    value.instances = value.instances.filter((i) => i.id !== id);
    write(value);
  },
  settings: async (): Promise<Settings> =>
    desktop ? invoke("get_settings") : read().settings,
  saveSettings: async (settings: Settings): Promise<void> => {
    if (desktop) return invoke("save_settings", { settings });
    const value = read();
    value.settings = settings;
    write(value);
  },
};

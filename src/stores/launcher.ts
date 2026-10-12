import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api";
import type { Instance, InstanceInput, Settings, Theme } from "../types";
export const useLauncher = defineStore("launcher", () => {
  const instances = ref<Instance[]>([]);
  const settings = ref<Settings>({ theme: "system" });
  const loading = ref(true);
  const busy = ref(false);
  const error = ref("");
  const notice = ref("");
  const selectedId = ref("");
  const selected = computed(
    () =>
      instances.value.find((i) => i.id === selectedId.value) ??
      instances.value[0],
  );
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme() {
    document.documentElement.dataset.theme =
      settings.value.theme === "system"
        ? system.matches
          ? "dark"
          : "light"
        : settings.value.theme;
  }
  system.addEventListener("change", applyTheme);
  async function perform<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      return await action();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      busy.value = false;
    }
  }
  async function init() {
    loading.value = true;
    error.value = "";
    try {
      const [items, config] = await Promise.all([api.list(), api.settings()]);
      instances.value = items;
      settings.value = config;
      applyTheme();
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }
  async function save(input: InstanceInput, id?: string) {
    return perform(async () => {
      const item = id ? await api.update(id, input) : await api.create(input);
      instances.value = id
        ? instances.value.map((i) => (i.id === id ? item : i))
        : [...instances.value, item];
      selectedId.value = item.id;
      notice.value = id ? "Instance settings updated." : "Instance created.";
      return item;
    });
  }
  async function favorite(id: string) {
    await perform(async () => {
      const item = await api.favorite(id);
      instances.value = instances.value.map((i) => (i.id === id ? item : i));
    });
  }
  async function remove(id: string) {
    return perform(async () => {
      await api.remove(id);
      instances.value = instances.value.filter((i) => i.id !== id);
      notice.value =
        "Instance removed. Desktop files are retained in the trash folder.";
      return true;
    });
  }
  async function theme(theme: Theme) {
    await perform(async () => {
      await api.saveSettings({ theme });
      settings.value = { theme };
      applyTheme();
      notice.value = "Appearance saved.";
    });
  }
  return {
    instances,
    settings,
    loading,
    busy,
    error,
    notice,
    selectedId,
    selected,
    init,
    save,
    favorite,
    remove,
    theme,
  };
});

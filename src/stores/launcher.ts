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
  const loadError = ref("");
  const settingsError = ref("");
  const saveError = ref("");
  const deleteError = ref("");
  const libraryReady = ref(false);
  const settingsReady = ref(false);
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
  function message(e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  async function perform<T>(
    action: () => Promise<T>,
    target = error,
  ): Promise<T | undefined> {
    if (busy.value) return undefined;
    busy.value = true;
    target.value = "";
    notice.value = "";
    try {
      return await action();
    } catch (e) {
      target.value = message(e);
    } finally {
      busy.value = false;
    }
  }
  async function init() {
    if (busy.value) return;
    loading.value = true;
    loadError.value = "";
    settingsError.value = "";
    try {
      // A settings failure must not discard a successfully loaded library.
      const [items, config] = await Promise.allSettled([
        api.list(),
        api.settings(),
      ]);
      libraryReady.value = items.status === "fulfilled";
      settingsReady.value = config.status === "fulfilled";
      if (items.status === "fulfilled") instances.value = items.value;
      else loadError.value = message(items.reason);
      if (config.status === "fulfilled") {
        settings.value = config.value;
        applyTheme();
      } else settingsError.value = message(config.reason);
    } finally {
      loading.value = false;
    }
  }
  async function save(input: InstanceInput, id?: string) {
    if (loading.value || !libraryReady.value) return;
    return perform(async () => {
      const item = id ? await api.update(id, input) : await api.create(input);
      instances.value = id
        ? instances.value.map((i) => (i.id === id ? item : i))
        : [...instances.value, item];
      selectedId.value = item.id;
      notice.value = id ? "Instance settings updated." : "Instance created.";
      return item;
    }, saveError);
  }
  async function favorite(id: string) {
    if (loading.value || !libraryReady.value) return;
    await perform(async () => {
      const item = await api.favorite(id);
      instances.value = instances.value.map((i) => (i.id === id ? item : i));
    });
  }
  async function remove(id: string) {
    if (loading.value || !libraryReady.value) return;
    return perform(async () => {
      await api.remove(id);
      instances.value = instances.value.filter((i) => i.id !== id);
      notice.value =
        "Instance removed. Desktop files are retained in the trash folder.";
      return true;
    }, deleteError);
  }
  async function theme(theme: Theme) {
    if (loading.value || !settingsReady.value) return;
    await perform(async () => {
      await api.saveSettings({ theme });
      settings.value = { theme };
      applyTheme();
      notice.value = "Appearance saved.";
    }, settingsError);
  }
  async function openProject() {
    try {
      await api.openProject();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  }
  return {
    openProject,
    loadError,
    settingsError,
    saveError,
    deleteError,
    libraryReady,
    settingsReady,
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

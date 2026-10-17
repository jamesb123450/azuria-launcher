import { ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
export interface SavedSkin {
  id: string;
  name: string;
  image: string;
  variant: string;
  capeId: string | null;
}
export type SkinDraft = Omit<SavedSkin, "id"> & { id: string | null };
export const useSkinLibrary = defineStore("skin-library", () => {
  const skins = ref<SavedSkin[]>([]);
  const busy = ref(false);
  const error = ref("");
  async function load() {
    if (!desktop || busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      skins.value = await invoke<SavedSkin[]>("skin_library_list");
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }
  async function save(input: SkinDraft) {
    if (busy.value) return false;
    busy.value = true;
    error.value = "";
    try {
      skins.value = await invoke<SavedSkin[]>("skin_library_save", { input });
      return true;
    } catch (e) {
      error.value = String(e);
      return false;
    } finally {
      busy.value = false;
    }
  }
  async function remove(id: string) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      skins.value = await invoke<SavedSkin[]>("skin_library_remove", { id });
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }
  return { skins, busy, error, load, save, remove };
});

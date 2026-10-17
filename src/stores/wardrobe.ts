import { ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
export interface Wardrobe {
  skin: string | null;
  variant: string;
  capes: { id: string; alias: string; active: boolean; image: string | null }[];
}
export const useWardrobe = defineStore("wardrobe", () => {
  const profile = ref<Wardrobe | null>(null);
  const busy = ref(false);
  const error = ref("");
  const owner = ref("");
  let generation = 0;
  function reset(id = "") {
    generation++;
    owner.value = id;
    profile.value = null;
    error.value = "";
    busy.value = false;
  }
  async function load(id: string) {
    if (!desktop || !id || busy.value) return;
    if (owner.value !== id) reset(id);
    const ticket = ++generation;
    busy.value = true;
    error.value = "";
    try {
      const p = await invoke<Wardrobe>("wardrobe_profile", { expectedId: id });
      if (ticket === generation) profile.value = p;
    } catch (e) {
      if (ticket === generation) error.value = String(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  async function change(action: string, id: string, capeId?: string) {
    if (busy.value || owner.value !== id) return;
    const ticket = generation;
    busy.value = true;
    error.value = "";
    try {
      const changed = await invoke<boolean>("wardrobe_change", {
        action,
        capeId: capeId ?? null,
        expectedId: id,
      });
      if (ticket !== generation) return;
      busy.value = false;
      if (changed) await load(id);
    } catch (e) {
      if (ticket === generation) error.value = String(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  return { profile, busy, error, owner, reset, load, change };
});

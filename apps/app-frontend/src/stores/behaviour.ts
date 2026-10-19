import { defineStore } from "pinia";
import { ref } from "vue";
import {
  behaviourApi,
  defaultBehaviour,
  type Behaviour,
} from "../behaviour-api";
export const useBehaviour = defineStore("behaviour", () => {
  const options = ref(defaultBehaviour()),
    ready = ref(false),
    error = ref("");
  let pending: Promise<void> | undefined;
  async function load() {
    if (ready.value) return;
    if (pending) return pending;
    pending = (async () => {
      error.value = "";
      try {
        options.value = await behaviourApi.load();
        ready.value = true;
      } catch (e) {
        error.value = String(e);
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }
  async function save(value: Behaviour) {
    await behaviourApi.save(value);
    options.value = { ...value };
    ready.value = true;
    error.value = "";
  }
  return { options, ready, error, load, save };
});

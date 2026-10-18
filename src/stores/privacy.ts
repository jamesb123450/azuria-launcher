import { defineStore } from "pinia";
import { ref } from "vue";
import { defaultPrivacy, privacyApi, type Privacy } from "../privacy-api";
export const usePrivacy = defineStore("privacy", () => {
  const options = ref(defaultPrivacy()),
    ready = ref(false),
    error = ref("");
  let pending: Promise<void> | undefined;
  function load() {
    if (ready.value) return Promise.resolve();
    return (pending ??= (async () => {
      error.value = "";
      try {
        options.value = await privacyApi.get();
        ready.value = true;
      } catch (e) {
        error.value = String(e);
        options.value.hideAccount = true;
      } finally {
        pending = undefined;
      }
    })());
  }
  async function save(value: Privacy) {
    await privacyApi.save(value);
    options.value = { ...value };
    ready.value = true;
  }
  return { options, ready, error, load, save };
});

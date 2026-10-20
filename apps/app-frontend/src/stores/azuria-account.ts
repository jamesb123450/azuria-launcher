import { ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
export interface AzuriaAccountView {
  configured: boolean;
  supported: boolean;
  account: {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
  } | null;
}
export const useAzuriaAccount = defineStore("azuria-account", () => {
  const view = ref<AzuriaAccountView>({
    configured: false,
    supported: false,
    account: null,
  });
  const busy = ref(false),
    ready = ref(false),
    pending = ref(false),
    error = ref("");
  let initializing: Promise<void> | undefined;
  async function perform(action: string, args?: Record<string, unknown>) {
    if (!desktop || busy.value) return false;
    busy.value = true;
    error.value = "";
    try {
      const result = await invoke<AzuriaAccountView | null>(action, args);
      if (result) view.value = result;
      return true;
    } catch (cause) {
      error.value =
        typeof cause === "string"
          ? cause
          : "Could not connect to Azuria accounts. Try again.";
      return false;
    } finally {
      busy.value = false;
    }
  }
  async function init() {
    if (ready.value) return;
    if (!initializing)
      initializing = (async () => {
        await perform("azuria_configuration");
        if (view.value.configured && view.value.supported)
          await perform("azuria_status");
        ready.value = true;
      })();
    await initializing;
  }
  async function begin() {
    if (await perform("azuria_begin")) pending.value = true;
  }
  async function complete(code: string) {
    if (await perform("azuria_complete", { code })) pending.value = false;
  }
  async function signOut() {
    if (await perform("azuria_sign_out")) pending.value = false;
  }
  return {
    view,
    busy,
    ready,
    pending,
    error,
    init,
    begin,
    complete,
    signOut,
    refresh: () => perform("azuria_status"),
    manage: () => perform("azuria_manage"),
  };
});

import { sessionResume } from "../lib/session-resume";
import { ref, onScopeDispose } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
export interface ConnectionUpdate {
  connecting: boolean;
  view: AzuriaAccountView | null;
  error: string | null;
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
    error = ref(""),
    connected = ref(false);
  let revision = 0;
  let stopResume = () => {};
  onScopeDispose(() => stopResume());
  function connection(update: ConnectionUpdate) {
    if (!update || (!update.connecting && !update.view && !update.error))
      return;
    if (update.error) {
      if (busy.value && !pending.value) return;
      error.value = update.error;
      busy.value = false;
      return;
    }
    revision++;
    busy.value = update.connecting;
    if (update.connecting) pending.value = true;
    error.value = update.error || "";
    if (update.view) {
      view.value = update.view;
      pending.value = false;
      connected.value = true;
    }
  }
  let initializing: Promise<void> | undefined;
  async function perform(action: string, args?: Record<string, unknown>) {
    if (!desktop || busy.value) return false;
    busy.value = true;
    error.value = "";
    const started = revision;
    try {
      const result = await invoke<AzuriaAccountView | null>(action, args);
      if (result && started === revision) view.value = result;
      return true;
    } catch (cause) {
      if (started !== revision) return false;
      if (
        typeof cause === "string" &&
        cause.startsWith("Your Azuria session has expired or was revoked.")
      ) {
        view.value = { ...view.value, account: null };
      }
      error.value =
        typeof cause === "string"
          ? cause
          : "Could not connect to Azuria accounts. Try again.";
      return false;
    } finally {
      if (started === revision) busy.value = false;
    }
  }
  async function init() {
    if (ready.value) return;
    if (!initializing)
      initializing = (async () => {
        if (desktop) {
          try {
            await listen<ConnectionUpdate>("azuria-connection", (event) =>
              connection(event.payload),
            );
          } catch {
            /* Manual code entry remains available. */
          }
        }
        await perform("azuria_configuration");
        if (view.value.configured && view.value.supported)
          await perform("azuria_status");
        if (desktop && view.value.configured && view.value.supported) {
          try {
            connection(await invoke<ConnectionUpdate>("azuria_connection"));
          } catch {
            /* Older native builds use manual codes. */
          }
        }
        ready.value = true;
        stopResume = sessionResume(
          () =>
            ready.value &&
            view.value.configured &&
            view.value.supported &&
            !busy.value &&
            !pending.value &&
            /kept|temporarily|could not reach|could not connect|request.*running/i.test(
              error.value,
            ),
          () => perform("azuria_status"),
        );
      })();
    await initializing;
  }
  async function begin() {
    connected.value = false;
    if ((await perform("azuria_begin")) && !connected.value)
      pending.value = true;
  }
  async function complete(code: string) {
    if (await perform("azuria_complete", { code })) {
      pending.value = false;
      connected.value = true;
    }
  }
  async function signOut() {
    if (await perform("azuria_sign_out")) {
      pending.value = false;
      connected.value = false;
    }
  }
  async function cancel() {
    if (await perform("azuria_cancel")) pending.value = false;
  }
  return {
    view,
    connected,
    cancel,
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

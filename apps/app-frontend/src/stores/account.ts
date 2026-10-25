import { sessionResume } from "../lib/session-resume";
import { computed, ref, onScopeDispose } from "vue";
import { defineStore } from "pinia";
import {
  accountApi,
  accountError,
  emptyAccount,
  type AuthStage,
} from "../auth";
import { usePrivacy } from "./privacy";
export const useAccount = defineStore("account", () => {
  const view = ref(emptyAccount());
  const busy = ref(false);
  const cancelling = ref(false);
  const stage = ref<AuthStage | null>(null);
  const error = ref("");
  const ready = ref(false);
  let generation = 0;
  let retryable = false;
  let stopResume = () => {};
  onScopeDispose(() => stopResume());
  const privacy = usePrivacy();
  const label = computed(() =>
    privacy.options.hideAccount
      ? "Minecraft account"
      : (view.value.account?.username ?? "Not signed in"),
  );
  async function operate(action: "restore" | "signIn" | "signOut") {
    if (busy.value || !view.value.supported) return;
    const current = ++generation;
    busy.value = true;
    stage.value =
      action === "signIn"
        ? "browser"
        : action === "restore"
          ? "microsoft"
          : "storage";
    error.value = "";
    retryable = false;
    let stop: (() => void) | undefined;
    try {
      stop = await accountApi.progress((value) => {
        if (current === generation) stage.value = value;
      });
      if (current !== generation) return;
      const result = await accountApi[action]();
      if (current === generation) view.value = result;
    } catch (cause) {
      if (current !== generation) return;
      error.value = accountError(cause);
      const code =
        typeof cause === "object" && cause !== null && "code" in cause
          ? String(cause.code)
          : "";
      retryable = [
        "network",
        "response",
        "http",
        "timeout",
        "service",
      ].includes(code);
      try {
        const status = await accountApi.status();
        if (current === generation) view.value = status;
      } catch {
        /* Retain the last known account; never invent success. */
      }
    } finally {
      stop?.();
      if (current === generation) {
        busy.value = false;
        stage.value = null;
      }
    }
  }
  async function init() {
    if (ready.value || busy.value) return;
    busy.value = true;
    try {
      await privacy.load();
      view.value = await accountApi.status();
    } catch (cause) {
      error.value = accountError(cause);
    } finally {
      busy.value = false;
      ready.value = true;
    }
    await privacy.load();
    if (view.value.supported && privacy.ready && privacy.options.restoreAccount)
      await operate("restore");
    stopResume = sessionResume(
      () =>
        ready.value &&
        !busy.value &&
        retryable &&
        view.value.hasSavedSession &&
        privacy.options.restoreAccount,
      () => operate("restore"),
    );
  }
  async function cancel() {
    if (!busy.value || cancelling.value) return;
    cancelling.value = true;
    // Ignore completion from the cancelled operation, including delayed IPC replies.
    ++generation;
    try {
      view.value = await accountApi.cancel();
      error.value = "Sign-in was cancelled.";
    } catch (cause) {
      error.value = accountError(cause);
    } finally {
      busy.value = false;
      cancelling.value = false;
      stage.value = null;
    }
  }
  return {
    view,
    busy,
    cancelling,
    stage,
    error,
    ready,
    label,
    init,
    cancel,
    signIn: () => operate("signIn"),
    restore: () => operate("restore"),
    signOut: () => operate("signOut"),
  };
});

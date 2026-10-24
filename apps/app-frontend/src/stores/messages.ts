import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { useAzuriaAccount } from "./azuria-account";
import { useFriends } from "./friends";
import type { Relationship } from "../friends-api";
export interface DirectMessage {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  encryption?: "encrypted" | "legacy" | "unverified";
}
export interface ConversationSummary {
  account_id: string;
  latest_at: string;
  unread: number;
}
export const useMessages = defineStore("messages", () => {
  const account = useAzuriaAccount();
  const friends = useFriends();
  watch(
    () => friends.busy,
    (busy) => {
      if (!busy && active.value) void refresh();
    },
  );
  const active = ref(false);
  const inbox = ref<ConversationSummary[]>([]);
  const owner = computed(() => account.view.account?.id ?? null);
  const peer = ref<Relationship | null>(null);
  const rows = ref<DirectMessage[]>([]);
  const unread = ref<Record<string, number>>({});
  const draft = ref("");
  const error = ref("");
  const securityCode = ref("");
  const notice = ref("");
  const busy = ref(false);
  const more = ref(false);
  let generation = 0;
  let network = Promise.resolve();
  let retry: { text: string; id: string } | null = null;
  watch(
    owner,
    () => {
      generation++;
      peer.value = null;
      rows.value = [];
      unread.value = {};
      inbox.value = [];
      draft.value = "";
      error.value = "";
      securityCode.value = "";
      notice.value = "";
      busy.value = false;
      retry = null;
    },
    { flush: "sync" },
  );
  async function call<T>(action: string, extra = {}): Promise<T> {
    const id = owner.value;
    const current = generation;
    const previous = network;
    let release!: () => void;
    network = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      // A rapid conversation switch must wait for the native session lock,
      // and obsolete queued requests must never be sent after sign-out.
      if (!id || owner.value !== id || current !== generation)
        throw new Error("Conversation changed.");
      const result = await invoke<{
        accountId: string;
        data: T;
        securityCode?: string;
      }>("azuria_messages", {
        action,
        target: peer.value?.account_id ?? null,
        before: null,
        clientId: null,
        body: null,
        ...extra,
      });
      if (
        owner.value !== id ||
        result.accountId !== id ||
        current !== generation
      )
        throw new Error("Account changed.");
      if (result.securityCode) securityCode.value = result.securityCode;
      return result.data;
    } finally {
      release();
    }
  }
  async function refresh(older = false) {
    if (!active.value || !owner.value || busy.value || friends.busy) return;
    const token = generation;
    busy.value = true;
    error.value = "";
    try {
      if (peer.value) {
        const page = await call<DirectMessage[]>("history", {
          before: older ? String(rows.value[0]?.id ?? "") : null,
        });
        if (token !== generation) return;
        const reset =
          !older &&
          page.length === 50 &&
          !page.some((row) =>
            rows.value.some((existing) => existing.id === row.id),
          );
        if (reset) rows.value = [];
        rows.value = [
          ...new Map(
            [...rows.value, ...page].map((row) => [row.id, row]),
          ).values(),
        ].sort((a, b) => a.id - b.id);
        if (
          reset ||
          older ||
          !rows.value.length ||
          rows.value.length === page.length
        )
          more.value = page.length === 50;
        const last = rows.value.at(-1);
        if (last && document.visibilityState === "visible")
          await call("read", { before: String(last.id) });
      }
      const counts = await call<ConversationSummary[]>("inbox");
      if (token === generation) {
        inbox.value = counts;
        unread.value = Object.fromEntries(
          counts.map((row) => [row.account_id, row.unread]),
        );
      }
    } catch (cause) {
      if (token === generation)
        error.value =
          typeof cause === "string"
            ? cause
            : "Could not load messages. Try again.";
    } finally {
      if (token === generation) busy.value = false;
    }
  }
  function select(row: Relationship | null) {
    generation++;
    peer.value = row;
    securityCode.value = "";
    notice.value = "";
    rows.value = [];
    draft.value = "";
    error.value = "";
    busy.value = false;
    more.value = false;
    retry = null;
    if (row) void refresh();
  }
  async function send() {
    if (friends.busy) {
      error.value = "Friends are updating. Try sending again in a moment.";
      return;
    }
    const text = draft.value.trim();
    if (!peer.value || !text || [...text].length > 2000 || busy.value) return;
    const token = generation;
    const pending =
      retry?.text === text ? retry : { text, id: crypto.randomUUID() };
    retry = pending;
    busy.value = true;
    error.value = "";
    try {
      const page = await call<DirectMessage[]>("send", {
        body: text,
        clientId: pending.id,
      });
      if (token !== generation) return;
      rows.value = [
        ...new Map(
          [...rows.value, ...page].map((row) => [row.id, row]),
        ).values(),
      ].sort((a, b) => a.id - b.id);
      const contact = peer.value?.account_id;
      if (contact) {
        inbox.value = [
          {
            account_id: contact,
            latest_at: page[0]?.created_at ?? new Date().toISOString(),
            unread: 0,
          },
          ...inbox.value.filter((row) => row.account_id !== contact),
        ];
      }
      draft.value = "";
      retry = null;
    } catch (cause) {
      if (token === generation)
        error.value =
          typeof cause === "string"
            ? cause
            : "Your message was not confirmed. Try sending it again.";
    } finally {
      if (token === generation) busy.value = false;
    }
  }
  async function recovery(action: "backup" | "restore", passphrase: string) {
    if (busy.value || friends.busy || !owner.value) return;
    const current = generation;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      await call(action, { body: passphrase });
      if (current !== generation) return;
      notice.value =
        action === "backup"
          ? "Encrypted recovery file saved. Keep it and your passphrase safe."
          : "Messaging key restored.";
    } catch (cause) {
      if (current === generation)
        error.value =
          typeof cause === "string"
            ? cause
            : "Could not complete messaging recovery.";
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  return {
    active,
    inbox,
    recovery,
    securityCode,
    notice,
    owner,
    peer,
    rows,
    unread,
    draft,
    error,
    busy,
    more,
    refresh,
    select,
    send,
  };
});

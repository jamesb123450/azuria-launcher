import { computed, onScopeDispose, ref, watch } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
import { useMessages } from "./messages";
import { useAzuriaAccount } from "./azuria-account";

export const statuses = {
  online: "Online",
  away: "Away",
  busy: "Do not disturb",
  offline: "Appear offline",
};
type Status = keyof typeof statuses;
interface Presence {
  status: Status;
  friends: Record<string, Status> | null;
  typing: boolean;
}

export const usePresence = defineStore("presence", () => {
  const account = useAzuriaAccount();
  const messages = useMessages();
  const owner = computed(() => account.view.account?.id);
  const peer = computed(() =>
    messages.active ? messages.peer?.account_id : undefined,
  );
  const status = ref<Status>("online");
  const friends = ref<Record<string, Status>>({});
  const typing = ref(false);
  const error = ref("");
  let savedStatus: Status | undefined;
  let nextHeartbeat = 0;
  let lastInput = 0;
  let announcedPeer: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let generation = 0;

  async function refresh() {
    if (!desktop || running || !owner.value || account.busy) return;
    const accountId = owner.value;
    const current = generation;
    const target = peer.value;
    const now = Date.now();
    const heartbeat = now >= nextHeartbeat;
    const writing =
      !!target && !!messages.draft.trim() && now - lastInput < 5000;
    const clear = announcedPeer && (!writing || announcedPeer !== target);
    const selected = savedStatus;
    if (!heartbeat && !target && !clear) return;

    running = true;
    try {
      const result = await invoke<{ accountId: string; data: Presence }>(
        "azuria_presence",
        {
          status: heartbeat ? (selected ?? null) : null,
          target: clear ? announcedPeer : (target ?? null),
          typing: clear ? false : writing ? true : null,
        },
      );
      if (current !== generation || result.accountId !== accountId) return;
      if (clear) announcedPeer = undefined;
      else if (writing) announcedPeer = target;
      if (peer.value === target && !clear) typing.value = result.data.typing;
      if (result.data.friends) friends.value = result.data.friends;
      if (heartbeat && savedStatus === selected) {
        savedStatus = result.data.status;
        status.value = result.data.status;
        error.value = "";
        // Read the existing status before publishing a heartbeat.
        nextHeartbeat = selected ? now + 30000 : 0;
      }
    } catch {
      typing.value = false;
      if (heartbeat && selected)
        error.value = "Could not sync your status. Azuria will retry.";
    } finally {
      running = false;
    }
  }

  watch(owner, () => {
    generation++;
    savedStatus = undefined;
    status.value = "online";
    friends.value = {};
    typing.value = false;
    announcedPeer = undefined;
    nextHeartbeat = 0;
    error.value = "";
    void refresh();
  });
  watch(peer, () => {
    typing.value = false;
    lastInput = 0;
    void refresh();
  });
  watch(
    () => messages.draft,
    (draft, previous) => {
      lastInput = draft.trim() && draft !== previous ? Date.now() : 0;
    },
  );
  function init() {
    if (!desktop || timer) return;
    void refresh();
    timer = setInterval(() => void refresh(), 2500);
  }
  function setStatus(value: Status) {
    if (!owner.value) return;
    savedStatus = value;
    status.value = value;
    nextHeartbeat = 0;
    void refresh();
  }
  onScopeDispose(() => clearInterval(timer));
  return { status, friends, typing, error, init, setStatus };
});

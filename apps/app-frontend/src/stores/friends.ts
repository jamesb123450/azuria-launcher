import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { useAzuriaAccount } from "./azuria-account";
import {
  friendsApi,
  type FriendAction,
  type Relationship,
  type FriendMatch,
} from "../friends-api";
export const useFriends = defineStore("friends", () => {
  const account = useAzuriaAccount();
  const entries = ref<Relationship[]>([]),
    matches = ref<FriendMatch[]>([]);
  const busy = ref(false),
    loaded = ref(false),
    error = ref(""),
    notice = ref("");
  const open = ref(false),
    tab = ref<"friends" | "requests" | "blocked" | "add">("friends");
  const searched = ref(false);
  let generation = 0;
  const owner = computed(() => account.view.account?.id ?? null);
  const friends = computed(() =>
    entries.value
      .filter((row) => row.kind === "friend")
      .sort((a, b) => a.display_name.localeCompare(b.display_name)),
  );
  const incoming = computed(() =>
    entries.value.filter((row) => row.kind === "incoming"),
  );
  const outgoing = computed(() =>
    entries.value.filter((row) => row.kind === "outgoing"),
  );
  const blocked = computed(() =>
    entries.value.filter((row) => row.kind === "blocked"),
  );
  async function request(
    action: FriendAction,
    target?: string,
    username?: string,
  ) {
    const id = owner.value;
    if (!id || busy.value) return false;
    const current = generation;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      const result = await friendsApi.request(action, target, username);
      if (
        current !== generation ||
        owner.value !== id ||
        result.accountId !== id
      )
        return false;
      if (result.entries) {
        entries.value = result.entries;
        loaded.value = true;
      }
      if (action === "find") {
        matches.value = result.matches;
        searched.value = true;
      } else if (action !== "snapshot") {
        matches.value = [];
        searched.value = false;
        notice.value = result.warning || "Saved.";
      }
      return true;
    } catch (cause) {
      if (current === generation)
        error.value =
          typeof cause === "string"
            ? cause
            : "Could not connect to Friends. Refresh and try again.";
      return false;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  watch(
    owner,
    (id) => {
      generation++;
      entries.value = [];
      matches.value = [];
      busy.value = false;
      loaded.value = false;
      error.value = "";
      notice.value = "";
      searched.value = false;
      open.value = false;
      if (id) void request("snapshot");
    },
    { flush: "sync" },
  );
  async function init() {
    await account.init();
    if (owner.value && !loaded.value && !busy.value) await request("snapshot");
  }
  function show(section: typeof tab.value = "friends") {
    tab.value = section;
    open.value = true;
    if (!busy.value) void request("snapshot");
  }
  return {
    entries,
    matches,
    busy,
    loaded,
    error,
    notice,
    open,
    tab,
    searched,
    owner,
    friends,
    incoming,
    outgoing,
    blocked,
    init,
    show,
    refresh: () => request("snapshot"),
    find: (username: string) => {
      matches.value = [];
      searched.value = false;
      return request("find", undefined, username);
    },
    act: (action: FriendAction, target: string) => request(action, target),
  };
});

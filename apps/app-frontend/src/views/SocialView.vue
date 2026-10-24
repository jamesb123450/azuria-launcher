<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  UsersRound,
  MessageCircle,
  Search,
  Plus,
  RefreshCw,
  LockKeyhole,
  X,
  ArrowUpRight,
  UserRoundPlus,
} from "@lucide/vue";
import { useFriends } from "../stores/friends";
import { useMessages } from "../stores/messages";
import { useAzuriaAccount } from "../stores/azuria-account";
import MessageConversation from "../components/MessageConversation.vue";
import MessageSecurity from "../components/MessageSecurity.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import type { Relationship } from "../friends-api";
import "./social.css";
let disposed = false;
const friends = useFriends();
const messages = useMessages();
const account = useAzuriaAccount();
const route = useRoute();
const router = useRouter();
const tab = ref<"friends" | "chats">("friends");
const search = ref("");
const securityOpen = ref(false);
const securityDialog = ref<HTMLDialogElement>();
const securityButton = ref<HTMLButtonElement>();
const contacts = computed(() => {
  const pool =
    tab.value === "friends"
      ? friends.friends
      : messages.inbox.flatMap((item) => {
          const friend = friends.friends.find(
            (row) => row.account_id === item.account_id,
          );
          return friend ? [friend] : [];
        });
  const query = search.value.trim().toLocaleLowerCase();
  return pool.filter((row) =>
    `${row.display_name} ${row.username}`.toLocaleLowerCase().includes(query),
  );
});
const recent = computed(
  () => new Map(messages.inbox.map((row) => [row.account_id, row])),
);
function selected(row: Relationship) {
  void router.replace({ path: "/social", query: { friend: row.account_id } });
}
function syncPeer() {
  if (disposed || !friends.owner || !friends.loaded) return;
  const id = typeof route.query.friend === "string" ? route.query.friend : "";
  const row = friends.friends.find((row) => row.account_id === id) ?? null;
  if (messages.peer?.account_id !== row?.account_id) messages.select(row);
  else if (row) messages.peer = row;
}
watch(
  [() => route.query.friend, () => friends.entries, () => friends.owner],
  syncPeer,
  { immediate: true },
);
watch(
  () => messages.peer,
  (peer) => {
    if (
      !peer &&
      router.currentRoute.value.path === "/social" &&
      route.query.friend
    )
      void router.replace({ path: "/social" });
  },
);
watch(
  () => [route.query.section, friends.owner],
  ([section]) => {
    if (
      friends.owner &&
      ["add", "requests", "blocked"].includes(String(section))
    ) {
      friends.show(section as "add" | "requests" | "blocked");
      void router.replace({
        path: "/social",
        query: route.query.friend ? { friend: route.query.friend } : {},
      });
    }
  },
  { immediate: true },
);
watch(
  () => router.currentRoute.value.path,
  (path) => {
    messages.active = path === "/social";
  },
  { immediate: true },
);
watch(
  () => friends.owner,
  () => {
    securityOpen.value = false;
    securityDialog.value?.close();
  },
);
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  if (disposed) return;
  timer = setTimeout(async () => {
    if (
      messages.active &&
      !friends.open &&
      !securityOpen.value &&
      document.visibilityState === "visible"
    )
      await messages.refresh();
    schedule();
  }, 15000);
}
async function refresh() {
  if (
    disposed ||
    !messages.active ||
    !friends.owner ||
    friends.busy ||
    messages.busy
  )
    return;
  await friends.refresh();
  if (disposed || !messages.active) return;
  syncPeer();
  await messages.refresh();
}
function visible() {
  if (
    document.visibilityState === "visible" &&
    messages.active &&
    !friends.open &&
    !securityOpen.value
  )
    void refresh();
}
async function showSecurity() {
  securityOpen.value = true;
  await nextTick();
  securityDialog.value?.showModal();
}
function closeSecurity() {
  securityDialog.value?.close();
  securityOpen.value = false;
  securityButton.value?.focus({ preventScroll: true });
}
function changeTab(value: "friends" | "chats") {
  tab.value = value;
  search.value = "";
}
function tabKey(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  changeTab(
    event.key === "Home"
      ? "friends"
      : event.key === "End"
        ? "chats"
        : tab.value === "friends"
          ? "chats"
          : "friends",
  );
  document.getElementById(`social-tab-${tab.value}`)?.focus();
}
function date(value: string) {
  const time = new Date(value);
  return time.toDateString() === new Date().toDateString()
    ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : time.toLocaleDateString([], { month: "short", day: "numeric" });
}
onMounted(async () => {
  document.addEventListener("visibilitychange", visible);
  schedule();
  await friends.init();
  await refresh();
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
  document.removeEventListener("visibilitychange", visible);
  messages.active = false;
  messages.select(null);
  securityDialog.value?.close();
});
</script>
<template>
  <section class="social-page" aria-labelledby="social-title">
    <header class="social-page-heading">
      <div>
        <h1 id="social-title">Social</h1>
        <span>Friends & messages</span>
      </div>
      <div class="social-page-actions" v-if="friends.owner">
        <button
          ref="securityButton"
          class="button secondary"
          @click="showSecurity"
        >
          <LockKeyhole :size="14" />Encryption
        </button>
        <button class="button secondary" @click="friends.show('friends')">
          <UsersRound :size="14" />Manage friends
        </button>
      </div>
    </header>
    <div class="social-layout" :class="{ 'has-conversation': messages.peer }">
      <aside class="social-contacts" aria-label="Friends and chats">
        <div
          class="social-tabs"
          role="tablist"
          aria-label="Social lists"
          @keydown="tabKey"
        >
          <button
            v-for="item in ['friends', 'chats'] as const"
            :key="item"
            :id="`social-tab-${item}`"
            role="tab"
            :aria-selected="tab === item"
            :tabindex="tab === item ? 0 : -1"
            aria-controls="social-contact-list"
            @click="changeTab(item)"
          >
            <component
              :is="item === 'friends' ? UsersRound : MessageCircle"
              :size="15"
            />{{ item === "friends" ? "Friends" : "Chats"
            }}<span v-if="item === 'friends' && friends.loaded">{{
              friends.friends.length
            }}</span>
          </button>
        </div>
        <div class="social-search">
          <label for="social-search"
            ><Search :size="15" /><input
              id="social-search"
              v-model="search"
              :aria-label="
                tab === 'friends' ? 'Search friends' : 'Search chats'
              "
              :placeholder="
                tab === 'friends' ? 'Search friends…' : 'Search chats…'
              "
              autocomplete="off"
          /></label>
          <button
            class="icon-button"
            aria-label="Add friend"
            :disabled="!friends.owner"
            @click="friends.show('add')"
          >
            <Plus :size="18" />
          </button>
        </div>
        <div class="social-contact-tools" v-if="friends.owner">
          <button
            v-if="friends.incoming.length"
            @click="friends.show('requests')"
          >
            <UserRoundPlus :size="13" />{{ friends.incoming.length }}
            {{ friends.incoming.length === 1 ? "request" : "requests" }}
          </button>
          <span v-else>{{
            tab === "friends" ? "Your friends" : "Recent conversations"
          }}</span>
          <button
            class="icon-button"
            aria-label="Refresh social"
            :disabled="friends.busy || messages.busy"
            @click="refresh"
          >
            <RefreshCw :size="13" />
          </button>
        </div>
        <div
          id="social-contact-list"
          class="social-contact-list"
          role="tabpanel"
          :aria-labelledby="`social-tab-${tab}`"
        >
          <div
            v-if="friends.busy && !friends.loaded"
            class="social-loading"
            role="status"
            aria-label="Loading friends"
          >
            <div v-for="item in 4" :key="item"><i /><span /><small /></div>
          </div>
          <button
            v-for="row in contacts"
            :key="row.account_id"
            class="social-contact"
            :class="{ selected: messages.peer?.account_id === row.account_id }"
            :aria-label="`Message ${row.display_name}`"
            :aria-pressed="messages.peer?.account_id === row.account_id"
            @click="selected(row)"
          >
            <span class="social-avatar">{{
              row.display_name.slice(0, 1).toUpperCase()
            }}</span>
            <span class="social-contact-name"
              ><strong>{{ row.display_name }}</strong
              ><small>{{
                tab === "chats" ? "Messages" : "@" + row.username
              }}</small></span
            >
            <span class="social-contact-meta"
              ><time
                v-if="tab === 'chats' && recent.get(row.account_id)"
                :datetime="recent.get(row.account_id)!.latest_at"
                >{{ date(recent.get(row.account_id)!.latest_at) }}</time
              ><b v-if="messages.unread[row.account_id]">{{
                messages.unread[row.account_id]
              }}</b
              ><ArrowUpRight v-else :size="13"
            /></span>
          </button>
          <p
            v-if="friends.owner && friends.loaded && !contacts.length"
            class="social-list-empty"
          >
            {{
              search
                ? "No matches. Try another name."
                : tab === "friends"
                  ? "Your friends will appear here."
                  : "Your conversations will appear here."
            }}
          </p>
          <p v-if="!friends.owner" class="social-list-empty">
            Sign in to see your friends and chats.
          </p>
          <p
            v-if="tab === 'chats' && messages.inbox.length >= 200"
            class="social-list-empty"
          >
            Showing recent chats. Find an older conversation in Friends.
          </p>
        </div>
        <footer class="social-contact-footer">
          <LockKeyhole :size="12" />New messages are end-to-end encrypted.
        </footer>
      </aside>
      <div class="social-conversation-surface">
        <MessageConversation
          v-if="messages.peer && friends.owner"
          :key="messages.peer.account_id"
          @back="router.replace('/social')"
        />
        <div v-else class="social-welcome">
          <span class="social-welcome-icon"
            ><component
              :is="friends.owner ? MessageCircle : UsersRound"
              :size="30"
              :stroke-width="1.4"
          /></span>
          <h2>
            {{
              friends.owner
                ? "Select a conversation"
                : "Your friends, right here"
            }}
          </h2>
          <p>
            {{
              friends.owner
                ? "Choose a friend to start messaging."
                : "Sign in to your Azuria account to add friends and send messages."
            }}
          </p>
          <button
            v-if="friends.owner && friends.loaded && !friends.friends.length"
            class="button primary"
            @click="friends.show('add')"
          >
            <Plus :size="15" />Add a friend
          </button>
          <RouterLink
            v-else-if="!friends.owner"
            to="/settings#account"
            class="button primary"
            >Sign in to Azuria<ArrowUpRight :size="14"
          /></RouterLink>
          <p v-if="messages.error" class="inline-error" role="alert">
            {{ messages.error }}
          </p>
        </div>
        <p
          v-if="friends.error"
          class="social-service-error inline-error"
          role="alert"
        >
          {{ friends.error }}
        </p>
      </div>
      <CommunitySidebar ads-only class="social-adverts" />
    </div>
    <dialog
      v-if="securityOpen"
      ref="securityDialog"
      class="social-security-dialog"
      aria-labelledby="social-security-title"
      @cancel.prevent="closeSecurity"
      @click="$event.target === securityDialog && closeSecurity()"
    >
      <header>
        <h2 id="social-security-title">
          <LockKeyhole :size="18" />Messaging security
        </h2>
        <button
          class="icon-button"
          aria-label="Close messaging security"
          @click="closeSecurity"
        >
          <X :size="18" />
        </button>
      </header>
      <MessageSecurity expanded />
    </dialog>
  </section>
</template>

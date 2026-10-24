<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  UsersRound,
  Plus,
  RefreshCw,
  X,
  Search,
  Check,
  ShieldBan,
  MessageCircle,
} from "@lucide/vue";
import { useFriends } from "../stores/friends";
import type { FriendAction, Relationship } from "../friends-api";
import { useMessages } from "../stores/messages";
import MessageConversation from "./MessageConversation.vue";
const messages = useMessages();
const friends = useFriends();
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  if (!friends.open) return;
  timer = setTimeout(async () => {
    if (document.visibilityState === "visible" && friends.open)
      await messages.refresh();
    schedule();
  }, 15000);
}
watch(
  () => friends.open,
  (open) => {
    messages.select(null);
    if (open) {
      void messages.refresh();
      schedule();
    } else clearTimeout(timer);
  },
);
watch(
  () => friends.entries,
  () => {
    if (
      messages.peer &&
      !friends.friends.some(
        (row) => row.account_id === messages.peer?.account_id,
      )
    )
      messages.select(null);
  },
);
const dialog = ref<HTMLDialogElement>();
const username = ref("");
const confirmation = ref<{ action: FriendAction; row: Relationship } | null>(
  null,
);
let trigger: HTMLElement | null = null;
function close() {
  friends.open = false;
  confirmation.value = null;
  trigger?.focus();
}
async function sync() {
  if (friends.open) {
    trigger = document.activeElement as HTMLElement;
    await nextTick();
    if (friends.open && friends.owner && !dialog.value?.open)
      dialog.value?.showModal();
  } else if (dialog.value?.open) dialog.value.close();
}
watch(() => friends.open, sync);
onMounted(() => {
  void sync();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  dialog.value?.close();
});
async function confirm() {
  const item = confirmation.value;
  if (item && (await friends.act(item.action, item.row.account_id)))
    confirmation.value = null;
}
</script>
<template>
  <dialog
    ref="dialog"
    class="friends-dialog"
    aria-labelledby="friends-dialog-title"
    @cancel.prevent="close"
    @click="$event.target === dialog && close()"
  >
    <header>
      <div>
        <h2 id="friends-dialog-title"><UsersRound :size="20" />Friends</h2>
        <p>Your Azuria connections.</p>
      </div>
      <button class="icon-button" aria-label="Close friends" @click="close">
        <X :size="18" />
      </button>
    </header>
    <nav aria-label="Friends sections">
      <button
        v-for="item in ['friends', 'requests', 'add', 'blocked'] as const"
        :key="item"
        :aria-current="friends.tab === item ? 'page' : undefined"
        @click="
          messages.select(null);
          friends.tab = item;
          confirmation = null;
        "
      >
        {{
          item === "add"
            ? "Add friend"
            : item === "requests"
              ? `Requests${friends.incoming.length ? " (" + friends.incoming.length + ")" : ""}`
              : item === "friends"
                ? "Friends"
                : "Blocked"
        }}</button
      ><button
        class="icon-button friends-refresh"
        :disabled="friends.busy"
        aria-label="Refresh friends"
        @click="friends.refresh"
      >
        <RefreshCw :size="15" />
      </button>
    </nav>
    <div class="friends-dialog-content">
      <p v-if="friends.error" class="inline-error" role="alert">
        {{ friends.error }}
      </p>
      <p v-if="friends.notice" role="status" class="muted">
        {{ friends.notice }}
      </p>
      <p v-if="friends.busy" role="status" class="muted">Connecting…</p>
      <MessageConversation v-if="messages.peer" />
      <section v-else-if="confirmation" class="friend-confirm">
        <h3>
          {{ confirmation.action === "block" ? "Block" : "Remove" }}
          {{ confirmation.row.display_name }}?
        </h3>
        <p>
          {{
            confirmation.action === "block"
              ? "This removes your friendship and any pending requests. Neither of you can send another request while the block is in place."
              : "You can send another friend request later."
          }}
        </p>
        <div class="friend-actions">
          <button
            class="button primary"
            :disabled="friends.busy"
            @click="confirm"
          >
            {{
              confirmation.action === "block"
                ? "Block account"
                : "Remove friend"
            }}</button
          ><button
            class="button secondary"
            :disabled="friends.busy"
            @click="confirmation = null"
          >
            Cancel
          </button>
        </div>
      </section>
      <template v-else-if="friends.tab === 'add'">
        <form class="friend-search" @submit.prevent="friends.find(username)">
          <label for="friend-username">Azuria username</label>
          <div>
            <input
              id="friend-username"
              v-model="username"
              autocomplete="off"
              spellcheck="false"
              autocapitalize="none"
              pattern="[A-Za-z0-9_]{3,24}"
              minlength="3"
              maxlength="24"
              required
              placeholder="Enter their full username"
            /><button class="button primary" :disabled="friends.busy">
              <Search :size="15" />Find
            </button>
          </div>
        </form>
        <p
          v-if="friends.searched && !friends.matches.length && !friends.busy"
          class="friend-empty"
        >
          No account found. Check their Azuria username and try again.
        </p>
        <article
          v-for="match in friends.matches"
          :key="match.id"
          class="friend-row"
        >
          <span class="friend-avatar">{{
            match.display_name.slice(0, 1).toUpperCase()
          }}</span>
          <div>
            <strong>{{ match.display_name }}</strong
            ><small>@{{ match.username }}</small>
          </div>
          <button
            v-if="match.relationship === 'none'"
            class="button primary"
            :disabled="friends.busy"
            @click="friends.act('send', match.id)"
          >
            <Plus :size="14" />Add</button
          ><span v-else class="friend-status">{{
            match.relationship === "friend"
              ? "Already friends"
              : match.relationship === "incoming"
                ? "Request received"
                : "Request sent"
          }}</span>
        </article>
      </template>
      <template v-else-if="friends.tab === 'requests'">
        <h3>Received</h3>
        <p
          v-if="!friends.incoming.length && !friends.busy"
          class="friend-empty"
        >
          No friend requests waiting.
        </p>
        <article
          v-for="row in friends.incoming"
          :key="row.account_id"
          class="friend-row"
        >
          <span class="friend-avatar">{{
            row.display_name.slice(0, 1).toUpperCase()
          }}</span>
          <div>
            <strong>{{ row.display_name }}</strong
            ><small>@{{ row.username }}</small>
          </div>
          <div class="friend-actions">
            <button
              class="icon-button"
              :disabled="friends.busy"
              :aria-label="`Accept ${row.username}`"
              @click="friends.act('accept', row.account_id)"
            >
              <Check :size="17" /></button
            ><button
              class="icon-button"
              :disabled="friends.busy"
              :aria-label="`Decline ${row.username}`"
              @click="friends.act('decline', row.account_id)"
            >
              <X :size="17" /></button
            ><button
              class="icon-button"
              :disabled="friends.busy"
              :aria-label="`Block ${row.username}`"
              @click="confirmation = { action: 'block', row }"
            >
              <ShieldBan :size="16" />
            </button>
          </div>
        </article>
        <h3>Sent</h3>
        <p
          v-if="!friends.outgoing.length && !friends.busy"
          class="friend-empty"
        >
          No outgoing requests.
        </p>
        <article
          v-for="row in friends.outgoing"
          :key="row.account_id"
          class="friend-row"
        >
          <div>
            <strong>{{ row.display_name }}</strong
            ><small>@{{ row.username }}</small>
          </div>
          <button
            class="button secondary"
            :disabled="friends.busy"
            @click="friends.act('cancel', row.account_id)"
          >
            Cancel request
          </button>
        </article>
      </template>
      <template v-else-if="friends.tab === 'blocked'">
        <p class="muted">
          Unblocking allows new requests. It does not restore a friendship.
        </p>
        <p v-if="!friends.blocked.length && !friends.busy" class="friend-empty">
          No blocked accounts.
        </p>
        <article
          v-for="row in friends.blocked"
          :key="row.account_id"
          class="friend-row"
        >
          <div>
            <strong>{{ row.display_name }}</strong
            ><small>@{{ row.username }}</small>
          </div>
          <button
            class="button secondary"
            :disabled="friends.busy"
            @click="friends.act('unblock', row.account_id)"
          >
            Unblock
          </button>
        </article>
      </template>
      <template v-else>
        <p
          v-if="friends.loaded && !friends.friends.length && !friends.busy"
          class="friend-empty"
        >
          Add a friend to get started.
        </p>
        <article
          v-for="row in friends.friends"
          :key="row.account_id"
          class="friend-row"
        >
          <span class="friend-avatar">{{
            row.display_name.slice(0, 1).toUpperCase()
          }}</span>
          <div>
            <strong>{{ row.display_name }}</strong
            ><small>@{{ row.username }}</small>
          </div>
          <div class="friend-actions">
            <button
              class="button secondary"
              :disabled="friends.busy"
              @click="messages.select(row)"
            >
              <MessageCircle :size="14" />Message{{
                messages.unread[row.account_id]
                  ? ` (${messages.unread[row.account_id]})`
                  : ""
              }}</button
            ><button
              class="button secondary"
              :disabled="friends.busy"
              @click="confirmation = { action: 'remove', row }"
            >
              Remove</button
            ><button
              class="icon-button"
              :disabled="friends.busy"
              :aria-label="`Block ${row.username}`"
              @click="confirmation = { action: 'block', row }"
            >
              <ShieldBan :size="16" />
            </button>
          </div>
        </article>
        <button class="button secondary" @click="friends.tab = 'add'">
          <Plus :size="15" />Add friend
        </button>
        <p class="friends-later muted">Online status is coming later.</p>
      </template>
    </div>
  </dialog>
</template>
<style scoped>
.friends-dialog {
  width: min(600px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 64px));
  padding: 0;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  box-shadow: 0 24px 100px #0006;
}
.friends-dialog::backdrop {
  background: #070812aa;
  backdrop-filter: blur(8px);
}
.friends-dialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid var(--border);
}
.friends-dialog h2 {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0;
  font-size: 19px;
}
.friends-dialog header p {
  margin: 7px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.friends-dialog nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.friends-dialog nav button:not(.icon-button) {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  padding: 9px 11px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.friends-dialog nav button[aria-current="page"] {
  background: var(--hover);
  color: var(--text);
}
.friends-refresh {
  margin-left: auto;
}
.friends-dialog-content {
  padding: 20px 24px 26px;
}
.friends-dialog h3 {
  font-size: 13px;
  margin: 16px 0 10px;
}
.friend-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid var(--border);
}
.friend-row > div:first-of-type {
  flex: 1;
  min-width: 0;
}
.friend-row strong {
  display: block;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.friend-row small {
  display: block;
  color: var(--muted);
  font-size: 11px;
  margin-top: 5px;
}
.friend-row .button {
  padding: 7px 10px;
  font-size: 11px;
}
.friend-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(140deg, #bd86be33, #8ba7df33);
  color: var(--text);
  font-size: 15px;
}
.friend-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}
.friend-search {
  display: grid;
  gap: 10px;
  font-size: 12px;
  margin: 8px 0 20px;
}
.friend-search > div {
  display: flex;
  gap: 10px;
}
.friend-search input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  padding: 11px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.friend-empty {
  color: var(--muted);
  padding: 20px 0;
  line-height: 1.7;
  font-size: 12px;
}
.friend-status,
.friends-later {
  font-size: 11px;
}
.friends-later {
  margin-top: 22px;
}
.friend-confirm p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
}
</style>

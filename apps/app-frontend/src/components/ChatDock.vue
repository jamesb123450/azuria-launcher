<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { MessageCircle, X, RefreshCw } from "@lucide/vue";
import { useFriends } from "../stores/friends";
import { useMessages } from "../stores/messages";
import MessageConversation from "./MessageConversation.vue";
import { statuses, usePresence } from "../stores/presence";
const presence = usePresence();
const friends = useFriends(),
  messages = useMessages();
const open = ref(false),
  panel = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>();
watch(open, async (value) => {
  messages.active = value;
  if (value) {
    await friends.refresh();
    await nextTick();
    panel.value?.focus();
  } else {
    messages.select(null);
    trigger.value?.focus();
  }
});
watch(
  () => friends.owner,
  () => {
    open.value = false;
  },
);
const refreshTimer = setInterval(() => {
  if (open.value && document.visibilityState === "visible")
    void messages.refresh();
}, 5000);
onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  if (open.value) {
    messages.active = false;
    messages.select(null);
  }
});
</script>
<template>
  <div class="chat-dock" @keydown.esc.stop="open = false">
    <Transition name="account-drop">
      <section
        v-if="open"
        id="launcher-chat"
        ref="panel"
        tabindex="-1"
        class="chat-popup"
        role="dialog"
        aria-label="Chat"
      >
        <header>
          <strong>Chat</strong
          ><button
            class="icon-button"
            aria-label="Close chat"
            @click="open = false"
          >
            <X :size="17" />
          </button>
        </header>
        <MessageConversation
          v-if="messages.peer"
          @back="messages.select(null)"
        />
        <div v-else class="chat-contacts">
          <p v-if="!friends.owner" class="muted">
            Sign in to your Azuria account to chat with friends.
          </p>
          <template v-else>
            <button
              class="text-link"
              :disabled="friends.busy"
              @click="friends.refresh()"
            >
              <RefreshCw :size="13" />Refresh friends
            </button>
            <p v-if="friends.error" role="alert">{{ friends.error }}</p>
            <button
              v-for="friend in friends.friends"
              :key="friend.account_id"
              class="chat-contact"
              @click="messages.select(friend)"
            >
              <span>{{ friend.display_name.slice(0, 1) }}</span
              ><strong>{{ friend.display_name }}</strong
              ><MessageCircle :size="16" />
            </button>
            <p v-if="!friends.busy && !friends.friends.length" class="muted">
              Your conversations start here. Add a friend in Social.
            </p>
          </template>
          <RouterLink
            to="/social"
            class="button secondary"
            @click="open = false"
            >Open Social</RouterLink
          >
        </div>
      </section>
    </Transition>
    <button
      ref="trigger"
      class="chat-dock-trigger"
      aria-controls="launcher-chat"
      :aria-expanded="open"
      @click="open = !open"
    >
      <MessageCircle :size="17" />Chat
    </button>
  </div>
</template>
<style scoped>
.chat-dock {
  position: fixed;
  inset-inline-end: clamp(12px, 23vw, 290px);
  bottom: 0;
  display: grid;
  justify-items: end;
  max-width: calc(100vw - 24px);
  z-index: 45;
}
.chat-dock-trigger {
  min-width: 124px;
  height: 42px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px 12px 0 0;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: var(--shadow);
}
.chat-popup {
  width: min(370px, calc(100vw - 36px));
  height: min(550px, calc(100dvh - 86px));
  min-height: 0;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.chat-popup > header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.chat-contacts {
  padding: 12px;
  min-height: 0;
  overflow: auto;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.chat-contact {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px;
  background: none;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  text-align: left;
}
.chat-contact:hover {
  background: var(--hover);
}
.chat-contact > span {
  display: grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  background: var(--accent-wash);
  border-radius: 8px;
}
.chat-contact > strong {
  flex: 1;
  min-width: 0;
}
.chat-contact small {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-weight: normal;
}
.chat-contacts > .button {
  margin-top: 12px;
}
.chat-contacts > .text-link {
  display: flex;
  gap: 8px;
  padding: 8px;
}
.chat-popup :deep(.conversation) {
  min-width: 0;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.chat-popup :deep(.message-feed) {
  min-height: 48px;
}
.chat-popup :deep(.message-composer) {
  flex: none;
  min-width: 0;
}
.chat-popup :deep(.message-composer textarea) {
  width: 100%;
  min-width: 0;
  padding: 8px;
}
.chat-popup :deep(.message-composer > div) {
  flex-wrap: wrap;
}
.chat-popup :deep(.message-bubble) {
  max-width: 95%;
}
@media (max-width: 760px) {
  .chat-dock {
    inset-inline-end: 12px;
  }
}
</style>

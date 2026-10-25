<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { MessageCircle, X, RefreshCw } from "@lucide/vue";
import { useFriends } from "../stores/friends";
import { useMessages } from "../stores/messages";
import MessageConversation from "./MessageConversation.vue";
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
onBeforeUnmount(() => {
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
  bottom: 0;
  right: 290px;
  width: 240px;
  z-index: 45;
}
.chat-dock-trigger {
  width: 100%;
  height: 42px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px 12px 0 0;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 -8px 30px #0002;
}
.chat-popup {
  height: min(520px, calc(100dvh - 120px));
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 14px 14px 0 0;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.chat-popup > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.chat-popup :deep(.conversation) {
  min-height: 0;
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.chat-popup :deep(.message-feed) {
  flex: 1;
  min-height: 100px;
  overflow: auto;
}
.chat-contacts {
  padding: 18px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
}
.chat-contact {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 0;
  background: none;
  border: 0;
  color: var(--text);
  text-align: left;
}
.chat-contact > span {
  background: var(--accent-wash);
  border-radius: 8px;
  padding: 6px 10px;
}
.chat-contact > strong {
  flex: 1;
}
.chat-contacts > .button {
  margin-top: 16px;
}
.chat-contacts > .text-link {
  display: flex;
  gap: 8px;
}
.chat-popup :deep(.conversation-header) {
  padding: 12px;
}
.chat-popup :deep(.message-composer) {
  padding: 12px;
}
.chat-popup :deep(textarea) {
  max-width: 100%;
  min-width: 0;
}
@media (max-width: 1100px) {
  .chat-dock {
    right: 230px;
    width: 200px;
  }
}
@media (max-width: 760px) {
  .chat-dock {
    right: 20px;
    width: min(300px, calc(100vw - 90px));
  }
}
</style>

<style scoped>
.chat-popup :deep(.message-composer textarea) {
  width: 100%;
  min-height: 60px;
}
.chat-popup :deep(.message-composer) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.chat-popup :deep(.conversation-security) {
  font-size: 10px;
  padding: 10px;
}
.chat-popup :deep(.message-bubble) {
  max-width: 95%;
  overflow-wrap: anywhere;
}
</style>

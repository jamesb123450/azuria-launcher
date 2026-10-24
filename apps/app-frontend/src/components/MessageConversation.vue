<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import {
  ArrowLeft,
  Send,
  RefreshCw,
  MessageCircle,
  LockKeyhole,
} from "@lucide/vue";
import { useMessages } from "../stores/messages";
defineEmits<{ back: [] }>();
const messages = useMessages();
const feed = ref<HTMLElement>();
watch(
  () => messages.rows.at(-1)?.id,
  async () => {
    await nextTick();
    feed.value?.scrollTo({
      top: feed.value.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  },
);
function time(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
</script>
<template>
  <section class="conversation" aria-label="Conversation">
    <header class="conversation-header">
      <button
        class="icon-button"
        aria-label="Back to friends"
        @click="$emit('back')"
      >
        <ArrowLeft :size="18" />
      </button>
      <div>
        <strong>{{ messages.peer?.display_name }}</strong
        ><small>@{{ messages.peer?.username }}</small>
      </div>
      <button
        class="icon-button"
        aria-label="Refresh messages"
        :disabled="messages.busy"
        @click="messages.refresh()"
      >
        <RefreshCw :size="16" />
      </button>
    </header>
    <details v-if="messages.securityCode" class="conversation-security">
      <summary>
        <LockKeyhole :size="13" />End-to-end encrypted · Security code
      </summary>
      <p>
        Compare this code with your friend using another trusted app or in
        person. Matching codes confirm that you have the same encryption keys.
      </p>
      <code>{{ messages.securityCode }}</code>
    </details>
    <p v-if="messages.error" class="inline-error" role="alert">
      {{ messages.error }}
    </p>
    <div
      ref="feed"
      class="message-feed"
      role="log"
      aria-label="Messages"
      aria-live="polite"
    >
      <button
        v-if="messages.more"
        class="button secondary older-messages"
        :disabled="messages.busy"
        @click="messages.refresh(true)"
      >
        Load older messages
      </button>
      <div v-if="!messages.rows.length && !messages.busy" class="message-empty">
        <MessageCircle :size="32" /><strong>Start a conversation</strong>
        <p>Say hello to {{ messages.peer?.display_name }}.</p>
      </div>
      <p
        v-if="messages.busy && !messages.rows.length"
        class="muted"
        role="status"
      >
        Loading messages…
      </p>
      <article
        v-for="row in messages.rows"
        :key="row.id"
        class="message-bubble"
        :class="{ mine: row.sender_id === messages.owner }"
      >
        <small v-if="row.encryption === 'legacy'" class="encryption-label"
          >Older message · Not end-to-end encrypted</small
        >
        <small
          v-else-if="row.encryption === 'unverified'"
          class="encryption-label"
          >Verification failed</small
        >
        <p>{{ row.body }}</p>
        <time :datetime="row.created_at">{{ time(row.created_at) }}</time>
      </article>
    </div>
    <form class="message-composer" @submit.prevent="messages.send">
      <label class="message-label" for="message-draft">Message</label>
      <textarea
        id="message-draft"
        v-model="messages.draft"
        rows="2"
        maxlength="2000"
        placeholder="Write a message…"
        @keydown.enter.exact.prevent="!$event.isComposing && messages.send()"
      />
      <div>
        <small>Enter to send · Shift + Enter for a new line</small
        ><button
          class="button primary"
          :disabled="messages.busy || !messages.draft.trim()"
        >
          <Send :size="15" />Send
        </button>
      </div>
    </form>
  </section>
</template>
<style scoped>
.conversation-security {
  font-size: 11px;
  color: var(--muted);
}
.conversation-security summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.conversation-security code {
  display: block;
  overflow-wrap: anywhere;
  line-height: 1.7;
  color: var(--text);
}
.encryption-label {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-bottom: 8px;
}
.conversation {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
  padding: 22px;
  animation: conversation-arrive 0.18s ease-out;
}
.conversation-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.conversation-header > div {
  flex: 1;
}
.conversation-header small {
  display: block;
  color: var(--muted);
  margin-top: 4px;
}
.message-feed {
  flex: 1;
  min-height: 80px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 4px;
  overscroll-behavior: contain;
}
.message-bubble {
  align-self: flex-start;
  max-width: 85%;
  padding: 12px 15px;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 14px 14px 14px 4px;
}
.message-bubble.mine {
  align-self: flex-end;
  background: linear-gradient(130deg, #a482c02b, #739de02b);
  border-radius: 14px 14px 4px 14px;
}
.message-bubble p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0 0 7px;
  font-size: 13px;
  line-height: 1.6;
}
.message-bubble time {
  font-size: 10px;
  color: var(--muted);
}
.message-empty {
  margin: auto;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
}
.message-empty strong {
  display: block;
  color: var(--text);
  margin-top: 12px;
}
.message-composer {
  display: grid;
  gap: 8px;
}
.message-label {
  font-size: 12px;
}
.message-composer textarea {
  resize: none;
  max-height: 150px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 12px;
  font: inherit;
  font-size: 13px;
}
.message-composer > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.message-composer small {
  color: var(--muted);
  font-size: 10px;
}
.older-messages {
  align-self: center;
}
@keyframes conversation-arrive {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .conversation {
    animation: none;
  }
  .message-feed {
    scroll-behavior: auto;
  }
}
</style>

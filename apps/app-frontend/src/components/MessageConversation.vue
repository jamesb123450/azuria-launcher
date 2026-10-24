<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { ArrowLeft, Send, RefreshCw, MessageCircle } from "@lucide/vue";
import { useMessages } from "../stores/messages";
const messages = useMessages();
const feed = ref<HTMLElement>();
watch(
  () => messages.rows.at(-1)?.id,
  async () => {
    await nextTick();
    feed.value?.scrollTo({ top: feed.value.scrollHeight, behavior: "smooth" });
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
        @click="messages.select(null)"
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
.conversation {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  height: min(340px, 38vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 4px;
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
  resize: vertical;
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
@media (prefers-reduced-motion: reduce) {
  .message-feed {
    scroll-behavior: auto;
  }
}
</style>

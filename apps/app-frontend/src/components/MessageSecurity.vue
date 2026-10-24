<script setup lang="ts">
import { ref, watch } from "vue";
import { useFriends } from "../stores/friends";
import { LockKeyhole, Download, Upload } from "@lucide/vue";
import { useMessages } from "../stores/messages";
const messages = useMessages();
const passphrase = ref("");
const friends = useFriends();
watch(
  () => [messages.owner, friends.open],
  () => {
    passphrase.value = "";
  },
);
async function recover(action: "backup" | "restore") {
  const value = passphrase.value;
  passphrase.value = "";
  await messages.recovery(action, value);
}
</script>
<template>
  <details class="message-security">
    <summary><LockKeyhole :size="13" />Messaging encryption & recovery</summary>
    <p>
      New messages are end-to-end encrypted. Back up your key before moving to
      another PC or reinstalling Windows. We cannot recover your messages if you
      lose both the key and its backup.
    </p>
    <p>
      The recovery file is encrypted with the passphrase you choose below. Keep
      both safe. Your Azuria password does not unlock it.
    </p>
    <label for="message-recovery-passphrase">Recovery passphrase</label>
    <input
      id="message-recovery-passphrase"
      v-model="passphrase"
      type="password"
      autocomplete="off"
      minlength="12"
      maxlength="256"
      placeholder="At least 12 characters"
    />
    <div class="recovery-actions">
      <button
        class="button secondary"
        :disabled="messages.busy || passphrase.length < 12"
        @click="recover('backup')"
      >
        <Download :size="13" />Save recovery file
      </button>
      <button
        class="button secondary"
        :disabled="messages.busy || passphrase.length < 12"
        @click="recover('restore')"
      >
        <Upload :size="13" />Restore from file
      </button>
    </div>
    <p v-if="messages.notice" role="status">{{ messages.notice }}</p>
    <p v-if="messages.error" class="inline-error" role="alert">
      {{ messages.error }}
    </p>
  </details>
</template>
<style scoped>
.message-security {
  padding: 12px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}
.message-security summary {
  display: flex;
  gap: 7px;
  align-items: center;
  cursor: pointer;
}
.message-security p {
  line-height: 1.7;
}
.message-security label {
  display: block;
  margin: 12px 0 8px;
  color: var(--text);
}
.message-security input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px;
  border-radius: 9px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  font: inherit;
}
.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.recovery-actions .button {
  padding: 8px 10px;
  font-size: 11px;
}
</style>

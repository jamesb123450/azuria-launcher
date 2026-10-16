<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useUpdates } from "../stores/updates";
import UpdatePanel from "./UpdatePanel.vue";
const updates = useUpdates();
const dialog = ref<HTMLDialogElement>();
const seconds = ref(15);
let timer: ReturnType<typeof setInterval> | undefined;
function stop() {
  clearInterval(timer);
  timer = undefined;
}
function later() {
  updates.defer();
  stop();
  dialog.value?.close();
}
watch(
  () => [updates.status, updates.deferred] as const,
  async ([status, deferred]) => {
    stop();
    const visible =
      !deferred &&
      ["downloading", "verifying", "ready", "installing"].includes(status);
    await nextTick();
    if (visible) {
      if (!dialog.value?.open) dialog.value?.showModal();
    } else dialog.value?.close();
    if (status === "ready" && !deferred) {
      seconds.value = 15;
      timer = setInterval(() => {
        seconds.value--;
        if (seconds.value <= 0) {
          stop();
          void updates.install();
        }
      }, 1000);
    }
  },
  { immediate: true },
);
onBeforeUnmount(stop);
</script>
<template>
  <dialog
    ref="dialog"
    class="startup-update"
    aria-label="Automatic launcher update"
    @cancel.prevent="updates.status === 'ready' ? later() : undefined"
  >
    <UpdatePanel compact />
    <footer v-if="updates.status === 'ready'">
      <span role="status">Restarting to install in {{ seconds }} seconds</span
      ><button class="button secondary" @click="later">Later</button>
    </footer>
    <p v-else class="startup-update-footnote">
      Signed updates · Your instances are retained
    </p>
  </dialog>
</template>
<style scoped>
.startup-update {
  width: min(570px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  overflow: auto;
  padding: 0;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
footer {
  border-top: 1px solid var(--border-strong);
  padding: 18px 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: var(--muted);
}
.startup-update-footnote {
  font-size: 10px;
  text-align: center;
  color: var(--muted);
  padding: 0 24px 18px;
  margin: 0;
}
</style>

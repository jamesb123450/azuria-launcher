<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { instanceApi } from "../instance-api";
import { desktop } from "../api";
import VersionPicker from "./VersionPicker.vue";
const props = defineProps<{ id: string }>();
const names = ref<string[]>([]);
const selected = ref("");
const text = ref("");
const error = ref("");
const paused = ref(false);
const follow = ref(true);
const output = ref<HTMLElement>();
const loaded = ref(false);
let generation = 0;
let pending = false;
async function poll() {
  if (pending || paused.value || document.visibilityState === "hidden") return;
  pending = true;
  const token = generation;
  const id = props.id;
  try {
    const files = await instanceApi.entries(id, "logs");
    if (token !== generation) return;
    names.value = files.map((f) => f.name);
    if (!names.value.includes(selected.value))
      selected.value = names.value.includes("azuria-launch.log")
        ? "azuria-launch.log"
        : names.value.includes("latest.log")
          ? "latest.log"
          : (names.value[0] ?? "");
    const name = selected.value;
    if (name) {
      const tail = await instanceApi.log(id, name);
      if (token !== generation || name !== selected.value || paused.value)
        return;
      if (tail !== text.value) {
        text.value = tail;
        await nextTick();
        if (follow.value && output.value)
          output.value.scrollTop = output.value.scrollHeight;
      }
    } else text.value = "";
    error.value = "";
    loaded.value = true;
  } catch (e) {
    if (token === generation) error.value = String(e);
  } finally {
    pending = false;
  }
}
watch(
  () => props.id,
  () => {
    generation++;
    selected.value = "";
    text.value = "";
    loaded.value = false;
    void poll();
  },
  { immediate: true },
);
watch(selected, () => {
  text.value = "";
  void poll();
});
watch(paused, (value) => {
  if (!value) void poll();
});
const timer = setInterval(() => {
  void poll();
}, 1000);
onBeforeUnmount(() => {
  generation++;
  clearInterval(timer);
});
</script>
<template>
  <section class="live-log-panel">
    <div class="live-log-toolbar">
      <VersionPicker
        v-if="names.length"
        v-model="selected"
        label="Log file"
        :options="names.map((name) => ({ value: name, label: name }))"
      /><span class="live-log-badge">{{
        paused ? "Paused" : "Live updates · every second"
      }}</span
      ><label><input v-model="paused" type="checkbox" />Pause</label
      ><label><input v-model="follow" type="checkbox" />Follow output</label>
    </div>
    <p v-if="!desktop" class="muted">
      Local logs are available in the installed desktop app.
    </p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <div v-if="loaded && !names.length" class="instance-files-empty">
      <h2>No game logs yet</h2>
      <p class="muted">
        The current game log appears here automatically after Minecraft starts.
      </p>
    </div>
    <template v-else-if="selected"
      ><p class="muted">
        Last 64 KB · common credential lines hidden. Review logs before sharing.
      </p>
      <pre ref="output" tabindex="0" aria-label="Live game log output">{{
        text || "Waiting for log output…"
      }}</pre>
    </template>
  </section>
</template>
<style scoped>
.live-log-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin: 24px 0;
}
.live-log-toolbar label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.live-log-toolbar input {
  accent-color: var(--pink);
}
.live-log-badge {
  font-size: 11px;
  color: var(--pink);
  margin-left: auto;
}
.live-log-panel > p {
  font-size: 12px;
}
.live-log-panel pre {
  height: 430px;
  max-height: 55vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 12px/1.7 monospace;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 18px;
}
</style>

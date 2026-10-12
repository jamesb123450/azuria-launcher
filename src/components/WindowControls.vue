<script setup lang="ts">
import { Minus, Square, X } from "@lucide/vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { desktop } from "../api";
import { useLauncher } from "../stores/launcher";
const store = useLauncher();
async function act(action: "minimize" | "toggleMaximize" | "close") {
  if (!desktop) return;
  try {
    await getCurrentWindow()[action]();
  } catch (error) {
    store.error = `Window action failed: ${String(error)}`;
  }
}
</script>
<template>
  <div
    v-if="desktop"
    class="window-controls"
    role="group"
    aria-label="Window controls"
  >
    <button
      title="Minimize"
      aria-label="Minimize window"
      @click="act('minimize')"
    >
      <Minus :size="15" /></button
    ><button
      title="Maximize or restore"
      aria-label="Maximize or restore window"
      @click="act('toggleMaximize')"
    >
      <Square :size="12" /></button
    ><button
      class="window-close"
      title="Close"
      aria-label="Close window"
      @click="act('close')"
    >
      <X :size="16" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { Settings, SlidersHorizontal, FolderCog } from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import { useQuickPlay } from "../stores/quick-play";
const router = useRouter(),
  quick = useQuickPlay();
const open = ref(false),
  busy = ref(false),
  error = ref("");
const host = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>(),
  first = ref<HTMLButtonElement>();
async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    first.value?.focus();
  }
}
function close() {
  open.value = false;
  trigger.value?.focus();
}
function outside(event: PointerEvent) {
  if (!host.value?.contains(event.target as Node)) open.value = false;
}
document.addEventListener("pointerdown", outside);
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
async function choose(profile: boolean) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (profile) {
      const setup = quick.setup ?? useLauncher().selected;
      await router.push(
        setup ? `/instances/${setup.id}?settings=java` : "/versions",
      );
    } else await router.push("/settings#launch-defaults");
    open.value = false;
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e);
  } finally {
    busy.value = false;
  }
}
function move(event: KeyboardEvent) {
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [
    ...host.value!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ];
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[
    (i + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
  ]?.focus();
}
</script>
<template>
  <div
    ref="host"
    class="hero-settings-menu"
    @keydown.esc.stop.prevent="close"
    @keydown="move"
  >
    <button
      ref="trigger"
      class="hero-settings"
      aria-label="Launch settings"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Settings :size="19" />
    </button>
    <div
      v-if="open"
      class="hero-settings-popover"
      role="menu"
      aria-label="Launch settings"
    >
      <button
        ref="first"
        role="menuitem"
        :disabled="busy"
        @click="choose(false)"
      >
        <SlidersHorizontal :size="17" /><span>Global settings</span></button
      ><button role="menuitem" :disabled="busy" @click="choose(true)">
        <FolderCog :size="17" /><span>Profile settings</span>
      </button>
      <p v-if="busy" role="status">Opening settings…</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

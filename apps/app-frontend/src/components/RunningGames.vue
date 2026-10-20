<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import { ExternalLink, Square, X, Gamepad2 } from "@lucide/vue";
import { useRouter } from "vue-router";
import { useGame } from "../stores/game";
import { useLauncher } from "../stores/launcher";
import { openMonitor } from "../monitor";
const game = useGame(),
  store = useLauncher(),
  router = useRouter();
const running = computed(() =>
  Object.values(game.launches).filter((l) => l.stage === "running"),
);
const open = ref(false),
  host = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>();
const name = (id: string) =>
  store.instances.find((i) => i.id === id)?.name ?? "Minecraft";
async function logs(id: string) {
  try {
    await openMonitor(id, router);
    open.value = false;
  } catch (e) {
    store.error = String(e);
  }
}
function outside(e: PointerEvent) {
  if (!host.value?.contains(e.target as Node)) open.value = false;
}
document.addEventListener("pointerdown", outside);
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
async function stop(id: string) {
  if (window.confirm("Stop Minecraft? Unsaved world changes may be lost."))
    await game.cancel(id);
}
</script>
<template>
  <div
    ref="host"
    class="running-control"
    @keydown.esc.stop.prevent="
      open = false;
      trigger?.focus();
    "
  >
    <button
      ref="trigger"
      class="running-count-button"
      aria-label="Running instances"
      :aria-expanded="open"
      aria-controls="running-games-panel"
      @click="open = !open"
    >
      <i class="game-status-dot" :class="{ active: running.length }" /><span
        role="status"
        aria-live="polite"
        >{{ running.length }}
        {{ running.length === 1 ? "instance" : "instances" }} running</span
      >
    </button>
    <button
      class="topbar-icon monitor-trigger"
      :disabled="!running.length"
      :aria-label="
        running.length
          ? `Open logs for ${name(running[0].id)}`
          : 'Open game monitor'
      "
      title="Open game monitor"
      @click="running[0] && logs(running[0].id)"
    >
      <ExternalLink :size="14" />
    </button>
    <section
      v-if="open"
      id="running-games-panel"
      class="activity-popover running-popover"
      aria-label="Running games"
    >
      <header>
        <h2>Running instances</h2>
        <button
          class="icon-button"
          aria-label="Close running instances"
          @click="
            open = false;
            trigger?.focus();
          "
        >
          <X :size="16" />
        </button>
      </header>
      <div v-if="!running.length" class="activity-empty">
        <Gamepad2 :size="26" />
        <h3>No games running</h3>
        <p>Launch Minecraft to open its game monitor.</p>
      </div>
      <article
        v-for="launch in running"
        :key="launch.id"
        class="running-instance"
      >
        <i class="game-status-dot" /><button
          class="running-game-name"
          @click="logs(launch.id)"
        >
          {{ name(launch.id) }}</button
        ><button
          :aria-label="`Stop ${name(launch.id)}`"
          :disabled="game.stopping[launch.id]"
          @click="stop(launch.id)"
        >
          <Square :size="13" /></button
        ><button
          :aria-label="`Monitor ${name(launch.id)}`"
          @click="logs(launch.id)"
        >
          <ExternalLink :size="15" />
        </button>
      </article>
    </section>
  </div>
</template>

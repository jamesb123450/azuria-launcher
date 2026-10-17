<script setup lang="ts">
import { computed } from "vue";
import { Play, LoaderCircle, Square, RotateCcw } from "@lucide/vue";
import { useGame, terminalStages } from "../stores/game";
import { useUpdates } from "../stores/updates";
import { useAccount } from "../stores/account";
import { desktop } from "../api";
import type { Instance } from "../types";
const props = defineProps<{ instance: Instance }>();
const game = useGame();
const updates = useUpdates();
const account = useAccount();
const launch = computed(() => game.launches[props.instance.id]);
const active = computed(
  () => launch.value && !terminalStages.includes(launch.value.stage),
);
const supported = computed(
  () => desktop && ["vanilla", "fabric"].includes(props.instance.loader),
);
const label = computed(() =>
  !supported.value
    ? "Launch unavailable"
    : active.value
      ? game.stopping[props.instance.id]
        ? "Stopping…"
        : "Stop"
      : launch.value?.stage === "error" || launch.value?.stage === "crashed"
        ? "Retry launch"
        : "Play",
);
function toggle() {
  if (active.value) {
    if (
      launch.value?.stage === "running" &&
      !window.confirm(
        "Stop Minecraft? Unsaved world changes may be lost. Use the game menu to save safely.",
      )
    )
      return;
    void game.cancel(props.instance.id);
  } else void game.launch(props.instance.id);
}
</script>
<template>
  <div class="launch-control">
    <button
      class="button primary"
      :disabled="
        !supported ||
        !game.ready ||
        !!game.stopping[instance.id] ||
        (!active && (account.busy || updates.busy))
      "
      @click="toggle"
    >
      <LoaderCircle
        v-if="game.stopping[instance.id]"
        :size="16"
        class="launch-spin"
      /><Square v-else-if="active" :size="15" /><RotateCcw
        v-else-if="label === 'Retry launch'"
        :size="16"
      /><Play v-else :size="16" />{{ label }}
    </button>
    <p v-if="!supported" class="launch-hint">
      {{
        desktop
          ? "Vanilla and Fabric launching are supported. Other loaders are coming soon."
          : "Minecraft launching requires the Windows desktop app."
      }}
    </p>
    <template v-else
      ><p v-if="active" class="launch-hint">
        {{
          game.stopping[instance.id]
            ? "Stopping Minecraft…"
            : launch?.stage === "running"
              ? "Minecraft running"
              : "Preparing Minecraft…"
        }}
      </p>
      <div
        v-if="launch && !active"
        :role="['error', 'crashed'].includes(launch.stage) ? 'alert' : 'status'"
        :class="[
          'launch-status',
          { 'inline-error': ['error', 'crashed'].includes(launch.stage) },
        ]"
      >
        <span
          >{{ launch.message
          }}<template v-if="launch.exitCode !== null && launch.exitCode !== 0">
            (exit {{ launch.exitCode }})</template
          ></span
        >
        <RouterLink
          v-if="launch.stage === 'error' || launch.stage === 'crashed'"
          class="text-link"
          :to="`/instances/${instance.id}?tab=logs`"
          >View logs</RouterLink
        >
      </div>
      <p v-else class="launch-hint">
        {{
          account.view.verified
            ? "Java and game files are prepared automatically on first launch."
            : "A verified Minecraft Java account is required. Sign in from Settings."
        }}
      </p></template
    >
  </div>
</template>
<style scoped>
.launch-control {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 460px;
}
.launch-control > .button {
  min-width: 130px;
  justify-content: center;
}
.launch-hint {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
  margin: 0;
  max-width: 330px;
}
.launch-status {
  display: flex;
  flex-direction: column;
  gap: 9px;
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.launch-status progress {
  width: 100%;
  height: 5px;
  accent-color: var(--pink);
}
.launch-actions {
  display: flex;
  gap: 10px;
}
.launch-actions button {
  border: 0;
  background: none;
  font-size: 11px;
  padding: 0;
}
.launch-spin {
  animation: launch-spin 1s linear infinite;
}
@keyframes launch-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Play, LoaderCircle, Square, RotateCcw } from "@lucide/vue";
import { useGame, terminalStages } from "../stores/game";
import { useUpdates } from "../stores/updates";
import { useAccount } from "../stores/account";
import { desktop } from "../api";
import type { Instance } from "../types";
import { useRouter } from "vue-router";
import { launchMonitored } from "../monitor";
const router = useRouter(),
  opening = ref(false),
  error = ref("");
const props = defineProps<{ instance: Instance; monitor?: boolean }>();
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
const retryPreparation = computed(
  () =>
    !!launch.value?.prepareOnly &&
    ["error", "cancelled"].includes(launch.value.stage),
);
const label = computed(() =>
  opening.value
    ? props.monitor
      ? "Opening monitor…"
      : "Preparing…"
    : !supported.value
      ? "Launch unavailable"
      : active.value
        ? game.stopping[props.instance.id]
          ? "Stopping…"
          : "Stop"
        : retryPreparation.value
          ? launch.value?.stage === "cancelled"
            ? "Resume download"
            : "Retry download"
          : launch.value?.stage === "error" || launch.value?.stage === "crashed"
            ? "Retry launch"
            : props.monitor
              ? "Launch game"
              : "Play",
);
async function toggle() {
  error.value = "";
  const id = props.instance.id;
  if (active.value) {
    if (
      launch.value?.stage === "running" &&
      !window.confirm(
        "Stop Minecraft? Unsaved world changes may be lost. Use the game menu to save safely.",
      )
    )
      return;
    void game.cancel(props.instance.id);
  } else if (retryPreparation.value) void game.prepare(props.instance.id);
  else {
    if (props.monitor && !account.view.verified) {
      await router.push("/settings#account");
      return;
    }
    opening.value = true;
    try {
      if (props.monitor) await launchMonitored(id, router, game.launch);
      else await game.launch(id);
    } catch (e) {
      error.value =
        typeof e === "string"
          ? e
          : "Could not open the game monitor. Try again.";
    } finally {
      opening.value = false;
    }
  }
}
</script>
<template>
  <div class="launch-control">
    <button
      class="button primary"
      :disabled="
        opening ||
        !supported ||
        !game.ready ||
        !!game.stopping[instance.id] ||
        (!active && (account.busy || updates.busy))
      "
      @click="toggle"
    >
      <LoaderCircle
        v-if="game.stopping[instance.id] || opening"
        :size="16"
        class="launch-spin"
      /><Square v-else-if="active" :size="15" /><RotateCcw
        v-else-if="label === 'Retry launch' || retryPreparation"
        :size="16"
      /><Play v-else :size="16" />{{ label }}
    </button>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
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
              : launch?.prepareOnly
                ? "Downloading game files…"
                : "Preparing Minecraft…"
        }}
      </p>
      <progress
        v-if="active && launch?.prepareOnly && launch.total > 0"
        :value="launch.completed"
        :max="launch.total"
        aria-label="Instance download progress"
      />
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
            ? "Java and game files download after creation. Play checks and reuses completed files."
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
.launch-control > progress,
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

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ChevronDown,
  Layers,
  Play,
  Square,
  LoaderCircle,
  X,
} from "@lucide/vue";
import { useRouter } from "vue-router";
import VersionPicker from "./VersionPicker.vue";
import { useQuickPlay } from "../stores/quick-play";
import { useGame, terminalStages } from "../stores/game";
import { useAccount } from "../stores/account";
import { useLauncher } from "../stores/launcher";
import { useUpdates } from "../stores/updates";
import { desktop } from "../api";
import { loaderName } from "../types";
const quick = useQuickPlay(),
  game = useGame(),
  account = useAccount(),
  launcher = useLauncher(),
  updates = useUpdates();
const router = useRouter(),
  dialog = ref<HTMLDialogElement>(),
  picker = ref<HTMLButtonElement>(),
  error = ref(""),
  manual = ref("");
const progress = computed(() =>
  quick.setup ? game.launches[quick.setup.id] : undefined,
);
const active = computed(
  () => progress.value && !terminalStages.includes(progress.value.stage),
);
const stopping = computed(() => quick.setup && game.stopping[quick.setup.id]);
const label = computed(() =>
  stopping.value
    ? "Stopping…"
    : active.value
      ? progress.value?.stage === "running"
        ? "Stop game"
        : "Cancel launch"
      : quick.preparing
        ? "Preparing…"
        : "Launch game",
);
const blocked = computed(
  () =>
    quick.preparing ||
    launcher.busy ||
    updates.busy ||
    account.busy ||
    !!stopping.value ||
    (!active.value && (!quick.version || !launcher.libraryReady)),
);
onMounted(() => {
  void quick.load();
});
function close() {
  dialog.value?.close();
  picker.value?.focus();
}
async function launch() {
  error.value = "";
  if (!desktop) {
    error.value =
      "Minecraft launching is available in the Windows app. This browser preview cannot launch games.";
    return;
  }
  if (active.value && quick.setup) {
    if (
      progress.value?.stage === "running" &&
      !window.confirm(
        "Stop Minecraft? Unsaved changes may be lost. Save and quit from the game to keep your world safe.",
      )
    )
      return;
    await game.cancel(quick.setup.id);
    return;
  }
  if (!account.view.verified) {
    await router.push("/settings#account");
    return;
  }
  if (!game.ready) {
    error.value =
      "Game status is still connecting. Wait a moment and try again.";
    return;
  }
  try {
    const item = await quick.ensureSetup();
    await game.launch(item.id);
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Couldn’t prepare Minecraft. Try again.";
  }
}
</script>
<template>
  <div class="quick-launch">
    <div class="launch-split">
      <button class="launch-main" :disabled="blocked" @click="launch">
        <strong
          ><LoaderCircle
            v-if="quick.preparing || stopping"
            :size="19"
            class="launch-spin"
          /><Square v-else-if="active" :size="17" /><Play v-else :size="19" />{{
            label
          }}</strong
        ><span
          ><Layers :size="12" />{{
            quick.version
              ? `Minecraft ${quick.version}`
              : quick.loading
                ? "Loading versions…"
                : "Choose a version"
          }}<template v-if="quick.version">
            · {{ loaderName(quick.loader) }}</template
          ></span
        ></button
      ><button
        ref="picker"
        class="launch-dropdown"
        :disabled="quick.preparing || !!active"
        aria-label="Choose version and loader"
        aria-haspopup="dialog"
        @click="dialog?.showModal()"
      >
        <ChevronDown :size="19" />
      </button>
    </div>
    <p v-if="progress && active" class="home-launch-status" role="status">
      {{ progress.message }}
    </p>
    <progress
      v-if="progress && active && progress.total > 0"
      :value="progress.completed"
      :max="progress.total"
      aria-label="Minecraft preparation progress"
    />
    <div
      v-if="
        error || (progress && ['error', 'crashed'].includes(progress.stage))
      "
      class="home-launch-error"
      role="alert"
    >
      {{ error || progress?.message
      }}<RouterLink
        v-if="quick.setup && !error"
        :to="`/instances/${quick.setup.id}?tab=logs`"
        >View logs</RouterLink
      >
    </div>
    <dialog
      ref="dialog"
      class="quick-version-dialog"
      aria-labelledby="quick-version-heading"
      @close="picker?.focus()"
    >
      <header>
        <h2 id="quick-version-heading">Choose what to play</h2>
        <button
          class="icon-button"
          aria-label="Close launch options"
          @click="close"
        >
          <X :size="19" />
        </button>
      </header>
      <span class="quick-picker-label">Minecraft version</span
      ><VersionPicker
        :model-value="quick.version"
        label="Home Minecraft version"
        :options="
          quick.versions
            .filter((v) => v.type === 'release' || v.id === quick.version)
            .map((v) => ({ value: v.id, label: v.id, detail: v.type }))
        "
        @update:model-value="quick.choose($event)"
      />
      <p v-if="quick.loading" role="status" class="muted">Loading versions…</p>
      <div v-if="quick.error" role="alert" class="quick-catalogue-error">
        <p>{{ quick.error }}</p>
        <button class="button secondary" @click="quick.load">Try again</button>
      </div>
      <details class="quick-manual">
        <summary>Enter a version manually</summary>
        <form @submit.prevent="quick.choose(manual)">
          <label for="manual-game-version">Minecraft version</label>
          <div>
            <input
              id="manual-game-version"
              v-model="manual"
              placeholder="e.g. 1.21.1"
              pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}"
              required
            /><button class="button secondary" type="submit">
              Use version
            </button>
          </div>
        </form>
      </details>
      <span class="quick-picker-label">Loader</span>
      <div class="quick-loaders" role="group" aria-label="Home mod loader">
        <button
          :aria-pressed="quick.loader === 'vanilla'"
          @click="quick.choose(quick.version, 'vanilla')"
        >
          Vanilla</button
        ><button
          :aria-pressed="quick.loader === 'fabric'"
          @click="quick.choose(quick.version, 'fabric')"
        >
          Fabric
        </button>
      </div>
      <p class="quick-picker-note">
        Each version and loader keeps its own worlds, mods and settings. Forge,
        NeoForge and Quilt launching are still in development.
      </p>
      <p v-if="quick.storageError" role="status">{{ quick.storageError }}</p>
      <footer>
        <RouterLink to="/versions" @click="close">Browse versions</RouterLink
        ><button class="button primary" @click="close">Done</button>
      </footer>
    </dialog>
  </div>
</template>

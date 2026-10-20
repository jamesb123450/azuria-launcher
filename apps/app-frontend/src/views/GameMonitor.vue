<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Terminal,
  Camera,
  ArrowLeft,
  FolderOpen,
  RefreshCw,
} from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import { useGame } from "../stores/game";
import { instanceApi } from "../instance-api";
import { desktop } from "../api";
import LiveLogs from "../components/LiveLogs.vue";
import ScreenshotsView from "./ScreenshotsView.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import WindowControls from "../components/WindowControls.vue";
const route = useRoute(),
  router = useRouter(),
  store = useLauncher(),
  game = useGame();
const id = computed(() => String(route.params.id)),
  instance = computed(() => store.instances.find((i) => i.id === id.value));
const mode = computed(() =>
    route.query.view === "screenshots" ? "screenshots" : "logs",
  ),
  error = ref("");
const nativeMonitor = desktop && window.location.hash.startsWith("#/monitor/");
function tab(view: string) {
  void router.replace({ query: view === "logs" ? {} : { view } });
}
async function folder() {
  try {
    await instanceApi.open(
      id.value,
      mode.value === "logs" ? "logs" : "screenshots",
    );
  } catch (e) {
    error.value = String(e);
  }
}
onMounted(async () => {
  await store.init();
  void game.init();
});
</script>
<template>
  <div class="game-monitor-shell">
    <header class="monitor-titlebar" data-tauri-drag-region>
      <img src="/branding/app-icon.png" alt="" /><span data-tauri-drag-region
        >Game monitor <span class="muted">/</span>
        {{ instance?.name ?? "Minecraft" }}</span
      ><WindowControls />
    </header>
    <nav class="monitor-rail" aria-label="Game monitor sections">
      <button
        :class="{ selected: mode === 'logs' }"
        aria-label="Game logs"
        :aria-pressed="mode === 'logs'"
        @click="tab('logs')"
      >
        <Terminal :size="22" /></button
      ><button
        :class="{ selected: mode === 'screenshots' }"
        aria-label="Game screenshots"
        :aria-pressed="mode === 'screenshots'"
        @click="tab('screenshots')"
      >
        <Camera :size="22" /></button
      ><RouterLink v-if="!nativeMonitor" to="/" aria-label="Back to launcher"
        ><ArrowLeft :size="22"
      /></RouterLink>
    </nav>
    <main class="monitor-content" id="monitor-main">
      <section v-if="store.loading" class="empty-state" role="status">
        Opening game monitor…
      </section>
      <section v-else-if="store.loadError" class="empty-state" role="alert">
        <h1>Couldn’t open this profile</h1>
        <p>{{ store.loadError }}</p>
        <button class="button secondary" @click="store.init">
          <RefreshCw :size="16" />Try again
        </button>
      </section>
      <section v-else-if="!instance" class="empty-state">
        <h1>Profile not found</h1>
        <p>This profile may have been removed.</p>
        <RouterLink v-if="!nativeMonitor" to="/versions"
          >Back to versions</RouterLink
        >
      </section>
      <template v-else
        ><div class="monitor-page-heading">
          <div>
            <h1>{{ mode === "logs" ? "Game logs" : "Screenshots" }}</h1>
            <p>
              {{ instance.name }} · Minecraft {{ instance.minecraftVersion }}
            </p>
          </div>
          <button
            v-if="mode === 'logs'"
            class="icon-button"
            aria-label="Open logs folder"
            :disabled="!desktop"
            @click="folder"
          >
            <FolderOpen :size="18" />
          </button>
        </div>
        <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
        <LiveLogs v-if="mode === 'logs'" :id="id" :key="id" /><ScreenshotsView
          v-else
          :instance-id="id"
          embedded
      /></template>
    </main>
    <CommunitySidebar ads-only />
  </div>
</template>

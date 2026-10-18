<script setup lang="ts">
import { useBehaviour } from "./stores/behaviour";
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter, type RouteLocationNormalized } from "vue-router";
import {
  Play,
  Settings,
  Compass,
  GitBranch,
  UserRound,
  Camera,
  Shirt,
  ChevronRight,
  CircleHelp,
  Download,
} from "@lucide/vue";
import { useLauncher } from "./stores/launcher";
import { desktop } from "./api";
import RouteSurface from "./components/RouteSurface.vue";
import SettingsView from "./views/SettingsView.vue";
import SkinHead from "./components/SkinHead.vue";
import StartupUpdate from "./components/StartupUpdate.vue";
import StorageMigration from "./components/StorageMigration.vue";
import WindowControls from "./components/WindowControls.vue";
import InstanceIcon from "./components/InstanceIcon.vue";
import { useUpdates } from "./stores/updates";
import { useAccount } from "./stores/account";
import { useContent } from "./stores/content";
import { useGame } from "./stores/game";
const game = useGame();
const content = useContent();
const account = useAccount();
function focusMain() {
  document.getElementById("main-content")?.focus();
}
const updates = useUpdates();
const store = useLauncher();
const behaviour = useBehaviour();
const route = useRoute();
const router = useRouter();
function resolveBackground(path: string): RouteLocationNormalized {
  const resolved = router.resolve(path);
  return { ...resolved, name: resolved.name ?? undefined };
}
const backgroundRoute = shallowRef(resolveBackground("/"));
const instanceSettingsRevision = ref(0);
watch(
  () => route.fullPath,
  (_, previous) => {
    if (previous?.startsWith("/settings") && route.name === "instance")
      instanceSettingsRevision.value++;
    if (!route.path.startsWith("/settings"))
      backgroundRoute.value = resolveBackground(route.fullPath);
    else if (previous && !previous.startsWith("/settings"))
      backgroundRoute.value = resolveBackground(previous);
  },
  { immediate: true },
);
const displayedRoute = computed(() =>
  route.path === "/settings" ? backgroundRoute.value : route,
);
function closeSettings() {
  void router.push(backgroundRoute.value.fullPath);
}
const page = computed(() =>
  route.path === "/settings"
    ? "Settings"
    : route.path.startsWith("/discover")
      ? "Discover"
      : route.path === "/roadmap"
        ? "Development"
        : route.name === "instance-settings"
          ? "Instance settings"
          : route.name === "instance"
            ? "Instance"
            : route.path === "/wardrobe"
              ? "Skins & capes"
              : route.path === "/screenshots"
                ? "Screenshots"
                : "Library",
);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => store.notice,
  (value) => {
    clearTimeout(noticeTimer);
    if (value)
      noticeTimer = setTimeout(() => {
        store.notice = "";
      }, 5000);
  },
);
watch(
  () => route.fullPath,
  () => {
    store.notice = "";
  },
);
onBeforeUnmount(() => clearTimeout(noticeTimer));
const storageReady = ref(false);
function storagePrepared() {
  storageReady.value = true;
  void behaviour.load();
  void store.init();
  void game.init();
  void content.init();
  void account.init();
  void updates.init();
}
</script>
<template>
  <StorageMigration v-if="!storageReady" @ready="storagePrepared" />
  <div v-else class="app-shell">
    <SettingsView v-if="route.path === '/settings'" @close="closeSettings" />
    <StartupUpdate v-if="desktop" />
    <a class="skip-link" href="#main-content" @click.prevent="focusMain"
      >Skip to content</a
    >
    <header
      class="topbar"
      :inert="route.path === '/settings'"
      data-tauri-drag-region
    >
      <div class="topbar-brand" data-tauri-drag-region>
        <RouterLink to="/" class="header-home" aria-label="Azuria home"
          ><img
            class="header-mark"
            src="/branding/app-icon.png"
            alt=""
            aria-hidden="true"
          />azuria<span class="brand-caption">Launcher</span></RouterLink
        ><span class="breadcrumb-divider" /><ChevronRight :size="13" /><span
          class="breadcrumb"
          >{{ page }}</span
        >
      </div>
      <div class="topbar-right">
        <RouterLink
          v-if="updates.update"
          to="/settings"
          class="text-link update-chip"
          ><Download :size="13" /> Update available</RouterLink
        >
        <span v-if="!desktop" class="preview-label">Browser preview</span
        ><span class="build-pill"
          >Early access <span>{{ updates.version }}</span></span
        >
      </div>
      <WindowControls />
    </header>
    <aside class="sidebar" :inert="route.path === '/settings'">
      <nav aria-label="Main navigation">
        <RouterLink
          to="/"
          class="rail-link"
          aria-label="Library"
          title="Library"
          ><Play :size="22" /><span class="rail-tooltip"
            >Library</span
          ></RouterLink
        >
        <RouterLink
          to="/discover"
          :class="{ 'router-link-active': route.path.startsWith('/discover') }"
          class="rail-link"
          aria-label="Discover"
          title="Discover"
          ><Compass :size="22" /><span class="rail-tooltip"
            >Discover</span
          ></RouterLink
        >
        <RouterLink
          to="/wardrobe"
          class="rail-link"
          aria-label="Skins and capes"
          title="Skins and capes"
          ><Shirt :size="21"
        /></RouterLink>
        <RouterLink
          to="/screenshots"
          class="rail-link"
          aria-label="Screenshots"
          title="Screenshots"
          ><Camera :size="21"
        /></RouterLink>
      </nav>
      <div class="rail-divider" />
      <div class="rail-instances" aria-label="Quick instance selection">
        <RouterLink
          v-for="item in store.instances.slice(0, 5)"
          :key="item.id"
          :to="`/instances/${item.id}`"
          :class="[
            'quick-instance',
            item.loader,
            { active: route.path === `/instances/${item.id}` },
          ]"
          :aria-label="'Open ' + item.name"
          :title="item.name"
          :aria-current="
            route.path === `/instances/${item.id}` ? 'page' : undefined
          "
          @click="store.selectedId = item.id"
          ><InstanceIcon
            :loader="item.loader"
            :seed="item.id"
            :icon="item.icon"
        /></RouterLink>
      </div>
      <div class="sidebar-bottom">
        <RouterLink
          to="/roadmap"
          class="rail-link"
          aria-label="Development information"
          title="Development information"
          ><CircleHelp :size="20" /></RouterLink
        ><a
          class="rail-link"
          href="https://github.com/jamesb123450/azuria-releases"
          @click.prevent="store.openProject"
          aria-label="Project on GitHub"
          title="Project on GitHub"
          ><GitBranch :size="20" /></a
        ><RouterLink
          to="/settings"
          class="rail-link"
          aria-label="Settings"
          title="Settings"
          ><Settings :size="21" /><span
            v-if="updates.update"
            class="update-dot"
            aria-label="Update available"
          /><span class="rail-tooltip">Settings</span></RouterLink
        >
        <RouterLink
          to="/settings#account"
          class="rail-avatar"
          :title="account.label"
          aria-label="Minecraft account"
        >
          <SkinHead />
        </RouterLink>
      </div>
    </aside>
    <div class="main-shell" :inert="route.path === '/settings'">
      <main
        id="main-content"
        tabindex="-1"
        :class="{ 'is-library': route.path === '/' }"
      >
        <RouteSurface :key="instanceSettingsRevision" :route="displayedRoute" />
      </main>
      <div
        v-if="content.job"
        :class="[
          'alert',
          'content-notification',
          content.job.stage === 'error' ? 'error' : 'success',
        ]"
        role="status"
      >
        <span
          >{{ content.job.message
          }}<template v-if="content.busy && content.job.total">
            ·
            {{
              Math.min(
                100,
                Math.round((content.job.completed / content.job.total) * 100),
              )
            }}%</template
          ></span
        >
        <button
          v-if="content.busy"
          :disabled="content.job.stage === 'installing'"
          @click="content.cancel"
        >
          Cancel install
        </button>
        <button
          v-else
          aria-label="Dismiss content status"
          @click="content.job = null"
        >
          ×
        </button>
      </div>
      <div v-else-if="game.error" class="alert error" role="alert">
        {{ game.error
        }}<button @click="game.error = ''" aria-label="Dismiss game error">
          ×
        </button>
      </div>
      <div v-else-if="store.error" class="alert error" role="alert">
        {{ store.error
        }}<button @click="store.error = ''" aria-label="Dismiss error">
          ×
        </button>
      </div>
      <div v-else-if="store.notice" class="alert success" role="status">
        {{ store.notice
        }}<button @click="store.notice = ''" aria-label="Dismiss notification">
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.content-notification {
  width: max-content;
  max-width: calc(100vw - 100px);
  gap: 18px;
  padding: 12px 16px;
  font-size: 12px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: 0 10px 32px #0003;
  align-items: center;
}
.content-notification > span {
  max-width: 460px;
  line-height: 1.5;
}
.content-notification > button {
  flex-shrink: 0;
  white-space: nowrap;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.content-notification > button:hover {
  background: var(--hover);
  border-color: var(--muted);
}
.content-notification > button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

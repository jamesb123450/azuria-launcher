<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import {
  Play,
  Settings,
  Compass,
  GitBranch,
  UserRound,
  ChevronRight,
  CircleHelp,
  Download,
} from "@lucide/vue";
import { useLauncher } from "./stores/launcher";
import { desktop } from "./api";
import WindowControls from "./components/WindowControls.vue";
import InstanceIcon from "./components/InstanceIcon.vue";
import { useUpdates } from "./stores/updates";
import { useAccount } from "./stores/account";
const account = useAccount();
function focusMain() {
  document.getElementById("main-content")?.focus();
}
const updates = useUpdates();
const store = useLauncher();
const route = useRoute();
const page = computed(() =>
  route.path === "/settings"
    ? "Settings"
    : route.path === "/discover"
      ? "Discover"
      : route.path === "/roadmap"
        ? "Development"
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
onMounted(() => {
  void store.init();
  void account.init();
  void updates.init();
});
</script>
<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content" @click.prevent="focusMain"
      >Skip to content</a
    >
    <header class="topbar" data-tauri-drag-region>
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
    <aside class="sidebar">
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
          class="rail-link"
          aria-label="Discover"
          title="Discover"
          ><Compass :size="22" /><span class="rail-tooltip"
            >Discover</span
          ></RouterLink
        >
      </nav>
      <div class="rail-divider" />
      <div class="rail-instances" aria-label="Quick instance selection">
        <RouterLink
          v-for="item in store.instances.slice(0, 5)"
          :key="item.id"
          to="/"
          :class="[
            'quick-instance',
            item.loader,
            { active: store.selected?.id === item.id },
          ]"
          :aria-label="'Select ' + item.name"
          :title="item.name"
          :aria-current="store.selected?.id === item.id ? 'true' : undefined"
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
          href="https://github.com/jamesb123450/azuria-launcher"
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
          <UserRound :size="18" />
        </RouterLink>
      </div>
    </aside>
    <div class="main-shell">
      <main
        id="main-content"
        tabindex="-1"
        :class="{ 'is-library': route.path === '/' }"
      >
        <RouterView />
      </main>
      <div v-if="store.error" class="alert error" role="alert">
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

<script setup lang="ts">
import {
  Monitor,
  Moon,
  Sun,
  Palette,
  ShieldCheck,
  FolderOpen,
} from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import AccountPanel from "../components/AccountPanel.vue";
import UpdatePanel from "../components/UpdatePanel.vue";
import type { Theme } from "../types";
import { ref } from "vue";
import { api, desktop } from "../api";
import LaunchDefaultsPanel from "../components/LaunchDefaultsPanel.vue";
import "./instance.css";
const store = useLauncher();
const folderError = ref("");
async function openInstances() {
  folderError.value = "";
  try {
    await api.openInstancesFolder();
  } catch (cause) {
    folderError.value = String(cause instanceof Error ? cause.message : cause);
  }
}
const themes: {
  value: Theme;
  label: string;
  icon: typeof Moon;
  description: string;
}[] = [
  {
    value: "system",
    label: "System",
    icon: Monitor,
    description: "Follow your device",
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
    description: "Use the dark theme",
  },
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "Use the light theme",
  },
];
</script>
<template>
  <section class="page-heading">
    <div>
      <h1>Settings</h1>
      <p class="muted">Account, appearance, game defaults and updates.</p>
    </div>
  </section>
  <AccountPanel />
  <UpdatePanel />
  <section class="settings-panel">
    <div class="settings-title">
      <Palette :size="22" />
      <div>
        <h2>Appearance</h2>
        <p class="muted">Choose a theme, or follow your system setting.</p>
      </div>
    </div>
    <div v-if="store.settingsError">
      <p role="alert" class="inline-error">{{ store.settingsError }}</p>
      <button
        class="button secondary"
        :disabled="store.loading || store.busy"
        @click="store.init"
      >
        Retry appearance settings
      </button>
    </div>
    <div class="theme-options">
      <button
        v-for="theme in themes"
        :key="theme.value"
        :class="[
          'theme-card',
          { active: store.settings.theme === theme.value },
        ]"
        :aria-pressed="store.settings.theme === theme.value"
        :disabled="store.loading || store.busy || !store.settingsReady"
        @click="store.theme(theme.value)"
      >
        <span :class="['theme-preview', theme.value]" aria-hidden="true"
          ><span class="preview-line" /></span
        ><component :is="theme.icon" :size="18" /><strong>{{
          theme.label
        }}</strong
        ><span>{{ theme.description }}</span>
      </button>
    </div>
  </section>
  <LaunchDefaultsPanel />
  <section class="settings-panel">
    <div class="settings-title">
      <ShieldCheck :size="22" />
      <div>
        <h2>Storage & privacy</h2>
        <p class="muted">
          Your desktop library and preferences stay on your computer.
        </p>
      </div>
    </div>
    <template v-if="desktop">
      <p class="muted">
        Windows data is stored in <code>%APPDATA%\AzuriaLauncher</code>. Each
        instance has a name-based folder inside <code>instances</code>.
      </p>
      <button class="button secondary" @click="openInstances">
        <FolderOpen :size="17" /> Open instances folder
      </button>
      <p v-if="folderError" class="inline-error" role="alert">
        {{ folderError }}
      </p>
    </template>
    <p class="muted">
      Vanilla game downloads and Java preparation are available through Play.
      Live content-provider integrations remain in development. This build does
      not collect analytics or upload logs.
    </p>
    <RouterLink class="text-link" to="/roadmap"
      >View development status</RouterLink
    >
  </section>
</template>

<script setup lang="ts">
import { Monitor, Moon, Sun, Palette, ShieldCheck } from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import UpdatePanel from "../components/UpdatePanel.vue";
import type { Theme } from "../types";
const store = useLauncher();
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
    description: "Dark surfaces, quiet contrast",
  },
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "Light surfaces, clear contrast",
  },
];
</script>
<template>
  <section class="page-heading">
    <div>
      <span class="eyebrow">PREFERENCES</span>
      <h1>Settings</h1>
      <p class="muted">Configure your launcher.</p>
    </div>
  </section>
  <UpdatePanel />
  <section class="settings-panel">
    <div class="settings-title">
      <Palette :size="22" />
      <div>
        <h2>Appearance</h2>
        <p class="muted">Pink and blue, in whichever light you prefer.</p>
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
    <p class="muted">
      Account sign-in, Java runtime selection, game downloads and provider
      configuration will appear as those integrations are implemented. This
      build does not collect analytics or upload logs.
    </p>
    <RouterLink class="text-link" to="/roadmap"
      >View the development roadmap →</RouterLink
    >
  </section>
</template>

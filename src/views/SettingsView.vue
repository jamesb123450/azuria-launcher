<script setup lang="ts">
import { Monitor, Moon, Sun, Palette, ShieldCheck } from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
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
    description: "A little after-hours",
  },
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "A brighter perspective",
  },
];
</script>
<template>
  <section class="page-heading">
    <div>
      <span class="eyebrow">MAKE YOURSELF AT HOME</span>
      <h1>Settings<span class="heading-dot">.</span></h1>
      <p class="muted">The details that make Azuria yours.</p>
    </div>
  </section>
  <section class="settings-panel">
    <div class="settings-title">
      <Palette :size="22" />
      <div>
        <h2>Appearance</h2>
        <p class="muted">Pink and blue, in whichever light you prefer.</p>
      </div>
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
        :disabled="store.loading || store.busy"
        @click="store.theme(theme.value)"
      >
        <component :is="theme.icon" :size="25" /><strong>{{
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
        <h2>A local-first foundation</h2>
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

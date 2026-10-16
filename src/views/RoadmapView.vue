<script setup lang="ts">
import { useLauncher } from "../stores/launcher";
const store = useLauncher();
import { Check, ArrowUpRight, Compass } from "@lucide/vue";
const stages = [
  {
    title: "Launcher & instance library",
    description:
      "Desktop shell, themes, instance library and Microsoft account controls.",
    status: "This build",
  },
  {
    title: "Game installation & launching",
    description:
      "Vanilla downloads, verified Java preparation and process monitoring. Authenticated play requires Minecraft Services access.",
    status: "This build",
  },
  {
    title: "Fabric & modded instances",
    description:
      "Fabric installation, compatible mods, resource packs and shaders.",
    status: "Planned",
  },
  {
    title: "Modpack discovery",
    description:
      "Modrinth and CurseForge discovery, dependencies and content updates.",
    status: "Planned",
  },
  {
    title: "Import, export & recovery",
    description:
      "Modpack import/export, diagnostics, recovery and public Windows releases.",
    status: "Planned",
  },
];
</script>
<template>
  <section class="page-heading">
    <div>
      <h1>Development</h1>
      <p class="muted">Current capabilities and planned work.</p>
    </div>
  </section>
  <div class="roadmap-intro">
    <Compass :size="30" />
    <div>
      <h2>Modrinth & CurseForge</h2>
      <p class="muted">
        Modrinth and CurseForge browsing will arrive after the game installation
        core. CurseForge access and Minecraft authentication require Azuria’s
        own approved credentials.
      </p>
    </div>
  </div>
  <ol class="roadmap-list">
    <li v-for="(stage, index) in stages" :key="stage.title">
      <span class="stage-number"
        ><Check v-if="!index" :size="19" /><template v-else>{{
          index + 1
        }}</template></span
      >
      <div>
        <h2>{{ stage.title }}</h2>
        <p class="muted">{{ stage.description }}</p>
      </div>
      <span :class="['stage-status', { current: !index }]">{{
        stage.status
      }}</span>
    </li>
  </ol>
  <a
    class="text-link"
    href="https://github.com/jamesb123450/azuria-launcher"
    @click.prevent="store.openProject"
    target="_blank"
    rel="noreferrer"
    >Follow development on GitHub <ArrowUpRight :size="16"
  /></a>
</template>

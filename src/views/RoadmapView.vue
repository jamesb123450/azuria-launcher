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
      "Vanilla and Fabric downloads, verified Java preparation and process monitoring. Authenticated play requires Minecraft Services access.",
    status: "This build",
  },
  {
    title: "More loaders & modded content",
    description:
      "Quilt, Forge and NeoForge launching and broader shader support.",
    status: "Planned",
  },
  {
    title: "Modpack discovery",
    description:
      "Live Modrinth and CurseForge discovery, required dependencies and verified installs. Content updates are planned.",
    status: "This build",
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
        Discover searches live provider catalogues and installs compatible
        content after review. Modrinth needs no key; CurseForge requires
        approved API access configured in Settings → Content providers. Modpacks
        currently support new Vanilla or Fabric instances.
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

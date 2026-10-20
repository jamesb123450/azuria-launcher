<script setup lang="ts">
import { computed } from "vue";
import { ArrowLeft, Settings, FolderOpen } from "@lucide/vue";
import type { Instance } from "../types";
import { loaderName } from "../types";
import { versionSeriesId } from "../lib/version-series";
import { versionArt } from "../lib/version-art";
import LaunchControl from "./LaunchControl.vue";
const props = defineProps<{ instance: Instance }>();
const emit = defineEmits<{ settings: []; versions: [] }>();
const art = computed(
  () =>
    versionArt[
      versionSeriesId({ id: props.instance.minecraftVersion, type: "release" })
    ],
);
</script>
<template>
  <aside
    class="version-context instance-launch-context"
    aria-label="Instance launch controls"
  >
    <div class="version-context-art">
      <img :src="art?.image ?? '/scenery/cherry-grove.webp'" alt="" /><span>{{
        art?.title ?? "Minecraft Java Edition"
      }}</span>
    </div>
    <div class="version-context-copy">
      <h2>Minecraft {{ instance.minecraftVersion }}</h2>
      <p>
        {{
          art?.description ??
          "Your worlds, packs and settings stay together in this instance."
        }}
      </p>
      <a
        href="https://www.minecraft.net/en-us/updates"
        target="_blank"
        rel="noopener noreferrer"
        >Minecraft updates ↗</a
      >
    </div>
    <div class="version-context-controls">
      <div class="instance-context-choice">
        <span>Version</span
        ><button @click="emit('versions')">
          {{ instance.minecraftVersion }}
        </button>
      </div>
      <div class="instance-context-choice">
        <span>Loader</span><strong>{{ loaderName(instance.loader) }}</strong>
      </div>
      <div class="version-setup-link">
        <FolderOpen :size="16" />Separate instance folder
      </div>
      <div class="instance-context-launch">
        <RouterLink
          class="icon-button"
          to="/versions"
          aria-label="Back to versions"
          ><ArrowLeft :size="18" /></RouterLink
        ><LaunchControl :instance="instance" /><button
          class="icon-button"
          aria-label="Instance settings"
          @click="emit('settings')"
        >
          <Settings :size="18" />
        </button>
      </div>
    </div>
  </aside>
</template>

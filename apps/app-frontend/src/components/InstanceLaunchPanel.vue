<script setup lang="ts">
import { computed, ref } from "vue";
import { Settings, FolderOpen, Clock3, Boxes } from "@lucide/vue";
import type { Instance } from "../types";
import { loaderName } from "../types";
import { versionSeriesId } from "../lib/version-series";
import { versionArt } from "../lib/version-art";
import { useRecentPlay } from "../stores/recent-play";
import { desktop } from "../api";
import { instanceApi } from "../instance-api";
import LaunchControl from "./LaunchControl.vue";
import InstanceIcon from "./InstanceIcon.vue";
import ContentIcon from "./ContentIcon.vue";
const props = defineProps<{
  instance: Instance;
  pack?: { name: string; iconUrl?: string | null };
  managedCount?: number;
}>();
const emit = defineEmits<{ settings: []; versions: [] }>();
const history = useRecentPlay(),
  error = ref("");
const art = computed(
  () =>
    versionArt[
      versionSeriesId({ id: props.instance.minecraftVersion, type: "release" })
    ],
);
const played = computed(() =>
  history.played[props.instance.id]
    ? new Date(history.played[props.instance.id]!).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Never played",
);
async function folder() {
  try {
    await instanceApi.open(props.instance.id);
  } catch {
    error.value = "The profile folder could not be opened. Try again.";
  }
}
</script>
<template>
  <aside
    class="version-context instance-launch-context profile-summary"
    aria-label="Instance launch controls"
  >
    <div class="profile-summary-art">
      <img :src="art?.image ?? '/scenery/home-panorama.webp'" alt="" />
      <div class="profile-summary-icon">
        <ContentIcon
          v-if="pack"
          :url="pack.iconUrl ?? null"
          :name="pack.name"
        /><InstanceIcon
          v-else
          :loader="instance.loader"
          :icon="instance.icon"
          :seed="instance.id"
        />
      </div>
      <button
        class="icon-button"
        aria-label="Instance settings"
        @click="emit('settings')"
      >
        <Settings :size="18" />
      </button>
    </div>
    <div class="profile-summary-copy">
      <span class="profile-kind">{{
        pack
          ? "Modpack"
          : instance.loader === "vanilla"
            ? "Minecraft Java"
            : "Custom profile"
      }}</span>
      <h2>Minecraft {{ instance.minecraftVersion }}</h2>
      <p>{{ loaderName(instance.loader) }} · {{ instance.minecraftVersion }}</p>
      <LaunchControl
        :instance="instance"
        monitor
        return-home
        compact-label
      /><button class="button secondary" :disabled="!desktop" @click="folder">
        <FolderOpen :size="15" />Open folder
      </button>
      <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
      <dl>
        <div>
          <Clock3 :size="17" />
          <dt>Last played</dt>
          <dd>{{ played }}</dd>
        </div>
        <div>
          <Boxes :size="17" />
          <dt>Content</dt>
          <dd>{{ managedCount ?? 0 }} managed projects</dd>
        </div>
        <div v-if="pack">
          <Boxes :size="17" />
          <dt>Modpack</dt>
          <dd>{{ pack.name }}</dd>
        </div>
      </dl>
    </div>
  </aside>
</template>
<style scoped>
.profile-summary {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel-soft);
  overflow: hidden;
}
.profile-summary-art {
  position: relative;
  height: 170px;
}
.profile-summary-art > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.profile-summary-art:after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent, #0b0e1450);
  pointer-events: none;
}
.profile-summary-icon {
  position: absolute;
  z-index: 1;
  bottom: -22px;
  left: 22px;
  border: 3px solid var(--panel-soft);
  border-radius: 13px;
  background: var(--panel);
  width: 60px;
  height: 60px;
  display: grid;
  place-items: center;
}
.profile-summary-icon :deep(.instance-symbol),
.profile-summary-icon :deep(.content-icon) {
  width: 52px;
  height: 52px;
  border-radius: 10px;
}
.profile-summary-art > .icon-button {
  position: absolute;
  z-index: 2;
  right: 14px;
  top: 14px;
  width: 35px;
  height: 35px;
  border-radius: 9px;
  border: 1px solid #ffffff35;
  background: #101521d9;
  color: #fff;
}
.profile-summary-copy {
  padding: 40px 22px 24px;
}
.profile-kind {
  display: inline-block;
  font-size: 10px;
  color: var(--pink);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 6px 9px;
}
.profile-summary h2 {
  font-size: 20px;
  margin: 15px 0 8px;
  overflow-wrap: anywhere;
}
.profile-summary p {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.7;
}
.profile-summary-copy > :deep(.launch-control) {
  margin: 24px 0 12px;
}
.profile-summary-copy :deep(.launch-control > .button),
.profile-summary-copy > .button {
  width: 100%;
  justify-content: center;
  min-height: 40px;
}
.profile-summary-copy :deep(.launch-hint) {
  font-size: 10px;
}
.profile-summary dl {
  margin: 28px 0 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.profile-summary dl > div {
  display: grid;
  grid-template-columns: 22px 1fr;
  gap: 5px 10px;
}
.profile-summary dt {
  font-size: 11px;
  font-weight: 600;
}
.profile-summary dd {
  grid-column: 2;
  font-size: 10px;
  color: var(--muted);
  margin: 0;
  overflow-wrap: anywhere;
}
.profile-summary dl svg {
  grid-row: 1 / span 2;
  color: var(--muted);
}
</style>

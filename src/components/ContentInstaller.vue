<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X } from "@lucide/vue";
import VersionPicker from "./VersionPicker.vue";
import {
  contentApi,
  type Provider,
  type Kind,
  type Project,
  type Version,
  type Plan,
} from "../content-api";
import { useLauncher } from "../stores/launcher";
import { useContent } from "../stores/content";
import { instanceApi, type FileEntry } from "../instance-api";
const props = defineProps<{ provider: Provider; kind: Kind }>();
const store = useLauncher(),
  content = useContent();
const dialog = ref<HTMLDialogElement>(),
  project = ref<Project | null>(null),
  instanceId = ref(""),
  versions = ref<Version[]>([]),
  selectedVersion = ref(""),
  world = ref(""),
  worlds = ref<FileEntry[]>([]),
  name = ref(""),
  versionLoading = ref(false),
  planning = ref(false),
  dialogError = ref(""),
  plan = ref<Plan | null>(null);
const eligible = computed(() =>
  store.instances.filter(
    (i) => props.kind !== "mods" || i.loader !== "vanilla",
  ),
);
let planRequest = 0;
let versionRequest = 0,
  trigger: HTMLElement | null = null;
async function open(projectValue: Project, versionId = "") {
  trigger = document.activeElement as HTMLElement;
  project.value = projectValue;
  name.value = projectValue.name;
  instanceId.value =
    eligible.value.find((i) => i.id === store.selectedId)?.id ??
    eligible.value[0]?.id ??
    "";
  selectedVersion.value = "";
  plan.value = null;
  dialogError.value = "";
  await nextTick();
  dialog.value?.showModal();
  await loadVersions();
  if (versionId) {
    if (versions.value.some((v) => v.id === versionId))
      selectedVersion.value = versionId;
    else {
      selectedVersion.value = "";
      dialogError.value =
        "This release is not compatible with the selected instance. Choose another instance or version.";
    }
  }
}
function close() {
  planRequest++;
  planning.value = false;
  versionLoading.value = false;
  dialog.value?.close();
  project.value = null;
  versionRequest++;
  trigger?.focus();
}
async function loadVersions() {
  if (!project.value) return;
  const current = ++versionRequest;
  plan.value = null;
  dialogError.value = "";
  versions.value = [];
  worlds.value = [];
  world.value = "";
  if (props.kind !== "modpacks" && !instanceId.value) return;
  versionLoading.value = true;
  try {
    const [list, files] = await Promise.all([
      contentApi.versions(
        props.provider,
        project.value.id,
        props.kind,
        props.kind === "modpacks" ? null : instanceId.value,
      ),
      props.kind === "datapacks"
        ? instanceApi.entries(instanceId.value, "worlds")
        : Promise.resolve([]),
    ]);
    if (current !== versionRequest) return;
    versions.value = list;
    selectedVersion.value =
      list.find((v) => v.releaseType === "release")?.id ?? list[0]?.id ?? "";
    worlds.value = files.filter((f) => f.directory);
    world.value = worlds.value[0]?.name ?? "";
    if (!list.length)
      dialogError.value =
        "No compatible versions were found for this instance.";
  } catch (e) {
    if (current === versionRequest) dialogError.value = String(e);
  } finally {
    if (current === versionRequest) versionLoading.value = false;
  }
}
watch(instanceId, () => {
  if (dialog.value?.open) void loadVersions();
});
watch([selectedVersion, world, name], () => (plan.value = null));
async function review() {
  if (!project.value) return;
  planning.value = true;
  const current = ++planRequest;
  dialogError.value = "";
  try {
    const result = await contentApi.plan(
      props.provider,
      project.value.id,
      selectedVersion.value,
      props.kind,
      props.kind === "modpacks" ? null : instanceId.value,
      name.value,
      props.kind === "datapacks" ? world.value : null,
    );
    if (current === planRequest && project.value) plan.value = result;
  } catch (e) {
    if (current === planRequest) dialogError.value = String(e);
  } finally {
    if (current === planRequest) planning.value = false;
  }
}
async function install() {
  if (!plan.value) return;
  await content.install(plan.value.id);
  if (!content.error) close();
}

const size = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;
onBeforeUnmount(() => {
  planRequest++;
  versionRequest++;
  dialog.value?.close();
});
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="instance-dialog content-install-dialog"
    aria-labelledby="content-install-title"
    @cancel.prevent="close"
  >
    <header class="create-heading">
      <div>
        <h2 id="content-install-title">Install {{ project?.name }}</h2>
        <p class="muted">Review compatible files before installing.</p>
      </div>
      <button
        class="icon-button"
        aria-label="Close content installation"
        @click="close"
      >
        <X :size="20" />
      </button>
    </header>
    <label v-if="kind === 'modpacks'" class="instance-field"
      >New instance name<input
        v-model="name"
        :disabled="planning"
        maxlength="80"
    /></label>
    <VersionPicker
      v-else
      v-model="instanceId"
      label="Install into instance"
      :disabled="planning"
      :options="
        eligible.map((i) => ({
          value: i.id,
          label: i.name,
          detail: `${i.loader} · ${i.minecraftVersion}`,
        }))
      "
    />
    <p v-if="kind !== 'modpacks' && !eligible.length" class="muted">
      Create a compatible instance first. Mods require a mod loader.
    </p>
    <p v-if="versionLoading" role="status">Finding compatible versions…</p>
    <VersionPicker
      v-else-if="versions.length"
      v-model="selectedVersion"
      label="Content version"
      :disabled="planning"
      :options="
        versions.map((v) => ({
          value: v.id,
          label: v.name,
          detail: v.releaseType === 'release' ? '' : v.releaseType,
        }))
      "
    />
    <VersionPicker
      v-if="kind === 'datapacks' && worlds.length"
      v-model="world"
      label="Install datapack into world"
      :disabled="planning"
      :options="worlds.map((w) => ({ value: w.name, label: w.name }))"
    />
    <p
      v-if="kind === 'datapacks' && !worlds.length && !versionLoading"
      class="muted"
    >
      Create a world in this instance before installing a datapack.
    </p>
    <p v-if="dialogError || content.error" class="inline-error" role="alert">
      {{ dialogError || content.error }}
    </p>
    <section v-if="plan" class="content-plan">
      <h3>Ready to install</h3>
      <p>
        {{ plan.preview.files }} files · {{ size(plan.preview.bytes) }} ·
        Minecraft {{ plan.preview.target.minecraft }} ·
        {{ plan.preview.target.loader }}
      </p>
      <ul>
        <li v-for="(n, i) in plan.preview.names" :key="i">{{ n }}</li>
      </ul>
      <p class="muted">
        Required dependencies are included. Optional client files are skipped.
        Existing files with different content are kept and installation stops.
      </p>
    </section>
    <footer class="dialog-actions">
      <button class="button secondary" @click="close">Cancel</button
      ><button
        v-if="!plan"
        class="button primary"
        :disabled="
          planning ||
          versionLoading ||
          !selectedVersion ||
          (kind === 'datapacks' && !world)
        "
        @click="review"
      >
        {{ planning ? "Checking files…" : "Review installation" }}</button
      ><button
        v-else
        class="button primary"
        :disabled="content.busy"
        @click="install"
      >
        Install {{ plan.preview.files }} files
      </button>
    </footer>
  </dialog>
</template>
<style scoped>
.content-install-dialog {
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
}
.content-install-dialog :deep(.version-picker),
.instance-field {
  margin-block: 18px;
}
.content-plan {
  margin-block: 20px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px;
}
.content-plan ul {
  max-height: 140px;
  overflow: auto;
  padding-left: 20px;
  font-size: 13px;
}
.content-plan p {
  font-size: 13px;
  line-height: 1.6;
}
</style>

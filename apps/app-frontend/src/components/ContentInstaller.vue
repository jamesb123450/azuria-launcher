<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  X,
  Search,
  Plus,
  ArrowLeft,
  Download,
  Calendar,
  AlertTriangle,
  Folder,
  ChevronRight,
} from "@lucide/vue";
import ContentIcon from "./ContentIcon.vue";
import InstanceIcon from "./InstanceIcon.vue";
import InstanceDialog from "./InstanceDialog.vue";
import type { Instance } from "../types";
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
const props = defineProps<{
  provider: Provider;
  kind: Kind;
  instanceId?: string;
}>();
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
const stage = ref<"profiles" | "versions">("versions"),
  search = ref(""),
  catalogue = ref<Version[]>([]),
  showIncompatible = ref(false),
  gameFilter = ref(""),
  loaderFilter = ref(""),
  creating = ref(false),
  requestedVersion = ref("");
const fixedTarget = computed(() => Boolean(props.instanceId));
const target = computed(() =>
  store.instances.find((i) => i.id === instanceId.value),
);
const games = computed(() => [
  ...new Set(catalogue.value.flatMap((v) => v.gameVersions)),
]);
const loaders = computed(() => [
  ...new Set(
    catalogue.value
      .filter(
        (v) => !gameFilter.value || v.gameVersions.includes(gameFilter.value),
      )
      .flatMap((v) => v.loaders),
  ),
]);
const packVersions = computed(() =>
  catalogue.value.filter(
    (v) =>
      (!gameFilter.value || v.gameVersions.includes(gameFilter.value)) &&
      (!loaderFilter.value || v.loaders.includes(loaderFilter.value)),
  ),
);
const visibleVersions = computed(() =>
  props.kind === "modpacks" ? packVersions.value : versions.value,
);
const incompatibleVersions = computed(() =>
  catalogue.value.filter((v) => !versions.value.some((c) => c.id === v.id)),
);
function compatible(i: Instance) {
  return catalogue.value.some(
    (v) =>
      (!requestedVersion.value || v.id === requestedVersion.value) &&
      v.gameVersions.includes(i.minecraftVersion) &&
      (props.kind !== "mods" ||
        (i.loader !== "vanilla" && v.loaders.includes(i.loader))),
  );
}
const matchingProfiles = computed(() =>
  store.instances.filter((i) =>
    i.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
const compatibleProfiles = computed(() =>
  matchingProfiles.value.filter(compatible),
);
const incompatibleProfiles = computed(() =>
  matchingProfiles.value.filter((i) => !compatible(i)),
);
let planRequest = 0;
let openRequest = 0;
let versionRequest = 0,
  trigger: HTMLElement | null = null;
async function open(projectValue: Project, versionId = "") {
  const opening = ++openRequest;
  planRequest++;
  planning.value = false;
  content.error = "";
  trigger = document.activeElement as HTMLElement;
  project.value = projectValue;
  name.value = projectValue.name;
  requestedVersion.value = versionId;
  search.value = "";
  catalogue.value = [];
  showIncompatible.value = false;
  gameFilter.value = "";
  loaderFilter.value = "";
  stage.value =
    props.kind !== "modpacks" && !fixedTarget.value ? "profiles" : "versions";
  instanceId.value = props.instanceId
    ? (store.instances.find((i) => i.id === props.instanceId)?.id ?? "")
    : "";
  selectedVersion.value = "";
  plan.value = null;
  dialogError.value = "";
  await nextTick();
  dialog.value?.showModal();
  const current = ++versionRequest;
  versionLoading.value = true;
  try {
    const list = await contentApi.catalogueVersions(
      props.provider,
      projectValue.id,
      props.kind,
    );
    if (current !== versionRequest || !project.value) return;
    catalogue.value = list;
    if (stage.value === "versions") await loadVersions();
  } catch (e) {
    if (current === versionRequest) dialogError.value = String(e);
  } finally {
    if (current === versionRequest) versionLoading.value = false;
  }
  if (opening !== openRequest || !project.value) return;
  if (stage.value === "versions" && versionId) {
    if (visibleVersions.value.some((v) => v.id === versionId))
      selectedVersion.value = versionId;
    else {
      selectedVersion.value = "";
      dialogError.value =
        "This release is not compatible with the selected instance. Choose another instance or version.";
    }
  }
}
function close() {
  openRequest++;
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
  planRequest++;
  planning.value = false;
  plan.value = null;
  dialogError.value = "";
  versions.value = [];
  worlds.value = [];
  world.value = "";
  selectedVersion.value = "";
  if (props.kind === "modpacks") {
    selectedVersion.value =
      catalogue.value.find((v) => v.releaseType === "release")?.id ??
      catalogue.value[0]?.id ??
      "";
    versionLoading.value = false;
    return;
  }
  if (!instanceId.value) {
    dialogError.value =
      "This profile is no longer available. Close this window and choose another profile.";
    versionLoading.value = false;
    return;
  }
  versionLoading.value = true;
  try {
    const [list, files] = await Promise.all([
      contentApi.versions(
        props.provider,
        project.value.id,
        props.kind,
        instanceId.value,
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
watch([selectedVersion, world, name], () => {
  planRequest++;
  planning.value = false;
  plan.value = null;
});
watch([gameFilter, loaderFilter], () => {
  if (!loaders.value.includes(loaderFilter.value)) loaderFilter.value = "";
  if (!packVersions.value.some((v) => v.id === selectedVersion.value))
    selectedVersion.value =
      packVersions.value.find((v) => v.releaseType === "release")?.id ??
      packVersions.value[0]?.id ??
      "";
});
async function chooseProfile(id: string) {
  instanceId.value = id;
  stage.value = "versions";
  await nextTick();
  await loadVersions();
  if (requestedVersion.value) {
    if (versions.value.some((v) => v.id === requestedVersion.value))
      selectedVersion.value = requestedVersion.value;
    else {
      selectedVersion.value = "";
      dialogError.value =
        "The selected release is not compatible with this profile. Choose a compatible release below.";
    }
  }
}
function back() {
  versionRequest++;
  versionLoading.value = false;
  planRequest++;
  planning.value = false;
  plan.value = null;
  stage.value = "profiles";
  selectedVersion.value = "";
}
function createProfile() {
  dialog.value?.close();
  creating.value = true;
}
async function created() {
  creating.value = false;
  await nextTick();
  if (!project.value) return;
  stage.value = "profiles";
  dialog.value?.showModal();
}
function published(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
async function review() {
  if (!project.value) return;
  if (
    !selectedVersion.value ||
    versionLoading.value ||
    stage.value !== "versions"
  )
    return;
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
  const opening = openRequest,
    id = plan.value.id;
  await content.install(id);
  if (opening === openRequest && plan.value?.id === id && !content.error)
    close();
}

const size = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;
watch(
  () => [props.provider, props.kind, props.instanceId],
  () => {
    if (project.value) close();
  },
);
onBeforeUnmount(() => {
  openRequest++;
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
    <header class="install-heading">
      <ContentIcon v-if="project" :url="project.iconUrl" :name="project.name" />
      <h2 id="content-install-title">Install {{ project?.name }}</h2>
      <button
        class="icon-button"
        aria-label="Close content installation"
        @click="close"
      >
        <X :size="20" />
      </button>
    </header>
    <template v-if="stage === 'profiles'">
      <div class="install-profile-tools">
        <label class="search-box"
          ><Search :size="17" /><input
            v-model="search"
            aria-label="Search profiles"
            :placeholder="`Search ${store.instances.length} profiles`"
        /></label>
        <button class="button secondary" @click="createProfile">
          <Plus :size="16" />Create
        </button>
      </div>
      <p v-if="versionLoading" role="status">Finding compatible profiles…</p>
      <section
        v-else
        class="install-profile-list"
        aria-label="Choose a profile"
      >
        <h3>Compatible profiles ({{ compatibleProfiles.length }})</h3>
        <button
          v-for="i in compatibleProfiles"
          :key="i.id"
          class="install-profile"
          :aria-label="`Install into ${i.name}`"
          @click="chooseProfile(i.id)"
        >
          <InstanceIcon :icon="i.icon" :loader="i.loader" :seed="i.id" />
          <strong>{{ i.name }}</strong
          ><span>{{ i.loader }} · {{ i.minecraftVersion }}</span
          ><ChevronRight :size="16" />
        </button>
        <p v-if="!compatibleProfiles.length" class="muted">
          {{
            search
              ? "No matching compatible profiles."
              : "No compatible profiles. Create a profile with a supported Minecraft version and loader."
          }}
        </p>
        <details
          v-if="incompatibleProfiles.length"
          class="install-incompatible"
        >
          <summary>
            Incompatible profiles ({{ incompatibleProfiles.length }})
          </summary>
          <div
            v-for="i in incompatibleProfiles"
            :key="i.id"
            class="install-profile unavailable"
          >
            <InstanceIcon
              :icon="i.icon"
              :loader="i.loader"
              :seed="i.id"
            /><strong>{{ i.name }}</strong
            ><span>{{ i.loader }} · {{ i.minecraftVersion }}</span>
          </div>
        </details>
      </section>
    </template>
    <template v-else>
      <div class="install-trust">
        <AlertTriangle :size="18" />
        <p>
          Azuria Studios does not review third-party content. Only install
          content from sources you trust.
        </p>
      </div>
      <div v-if="kind === 'modpacks'" class="install-pack-filters">
        <label class="instance-field"
          >Game version<select v-model="gameFilter" :disabled="planning">
            <option value="">All versions</option>
            <option v-for="g in games" :key="g" :value="g">
              Minecraft {{ g }}
            </option>
          </select></label
        >
        <label class="instance-field"
          >Loader<select v-model="loaderFilter" :disabled="planning">
            <option value="">Any loader</option>
            <option v-for="l in loaders" :key="l" :value="l">{{ l }}</option>
          </select></label
        >
      </div>
      <div v-else-if="target" class="install-target">
        <button v-if="!fixedTarget" class="text-link" @click="back">
          <ArrowLeft :size="15" />Profiles</button
        ><InstanceIcon :icon="target.icon" :loader="target.loader" /><span
          >{{ target.name
          }}<small
            >{{ target.loader }} · Minecraft
            {{ target.minecraftVersion }}</small
          ></span
        >
      </div>
      <div class="install-list-heading">
        <h3>Compatible versions ({{ visibleVersions.length }})</h3>
        <label
          v-if="kind !== 'modpacks' && incompatibleVersions.length"
          class="install-show"
          ><input v-model="showIncompatible" type="checkbox" />Show
          incompatible</label
        >
      </div>
      <p v-if="versionLoading" role="status">Finding compatible versions…</p>
      <div
        v-else
        class="install-versions"
        role="radiogroup"
        aria-label="Content version"
      >
        <label
          v-for="v in visibleVersions"
          :key="v.id"
          class="install-release"
          :class="{ chosen: selectedVersion === v.id }"
        >
          <span
            ><strong>{{ v.name }}</strong
            ><small
              >{{ v.gameVersions.join(", ") }} · {{ v.loaders.join(", ")
              }}<template v-if="v.releaseType !== 'release'">
                · {{ v.releaseType }}</template
              ></small
            ><small v-if="published(v.published)"
              ><Calendar :size="12" />{{ published(v.published) }}</small
            ></span
          >
          <input
            v-model="selectedVersion"
            type="radio"
            name="content-release"
            :value="v.id"
            :disabled="planning"
            :aria-label="v.name"
          />
        </label>
        <p v-if="!visibleVersions.length" class="muted">
          No compatible releases found. Try another
          {{ kind === "modpacks" ? "game version or loader" : "profile" }}.
        </p>
        <template v-if="showIncompatible"
          ><div
            v-for="v in incompatibleVersions"
            :key="v.id"
            class="install-release unavailable"
          >
            <span
              ><strong>{{ v.name }}</strong
              ><small
                >{{ v.gameVersions.join(", ") }} ·
                {{ v.loaders.join(", ") }}</small
              ></span
            ><span class="muted">Incompatible</span>
          </div></template
        >
      </div>
      <label v-if="kind === 'modpacks'" class="instance-field install-pack-name"
        >New instance name<input
          v-model="name"
          :disabled="planning"
          maxlength="80"
      /></label>
      <p v-if="kind === 'modpacks'" class="install-isolated">
        <Folder :size="15" />Installs into a separate profile folder.
      </p>
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
    </template>
    <p v-if="dialogError || content.error" class="inline-error" role="alert">
      {{ dialogError || content.error }}
    </p>
    <footer v-if="stage === 'versions'" class="dialog-actions install-footer">
      <button class="button secondary" @click="close">Cancel</button>
      <button
        v-if="!plan"
        class="button primary"
        :disabled="
          planning ||
          versionLoading ||
          !selectedVersion ||
          (kind === 'datapacks' && !world) ||
          (kind === 'modpacks' && !name.trim())
        "
        @click="review"
      >
        {{ planning ? "Checking files…" : "Review installation" }}
      </button>
      <button
        v-else
        class="button primary"
        :disabled="content.busy"
        @click="install"
      >
        <Download :size="15" />Install {{ plan.preview.files }} files
      </button>
    </footer>
  </dialog>
  <InstanceDialog v-if="creating" @close="created" />
</template>
<style scoped src="./content-installer.css"></style>

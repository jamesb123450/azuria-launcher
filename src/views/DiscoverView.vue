<script setup lang="ts">
import "./discover.css";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  Search,
  X,
  SlidersHorizontal,
  Package,
  Puzzle,
  FileCode2,
  Paintbrush,
  Download,
  Plus,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ExternalLink,
} from "@lucide/vue";
import VersionPicker from "../components/VersionPicker.vue";
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
import { desktop } from "../api";
import { gameVersions } from "../lib/game-versions";
import { instanceApi, type FileEntry } from "../instance-api";
const store = useLauncher(),
  content = useContent();
const tabs = [
  { id: "modpacks" as const, label: "Modpacks", icon: Package },
  { id: "mods" as const, label: "Mods", icon: Puzzle },
  { id: "datapacks" as const, label: "Datapacks", icon: FileCode2 },
  { id: "resourcepacks" as const, label: "Resource packs", icon: Paintbrush },
];
const kind = ref<Kind>("modpacks"),
  source = ref<Provider>("modrinth"),
  query = ref(""),
  category = ref(""),
  loader = ref(""),
  version = ref(""),
  sort = ref("relevance"),
  page = ref(1),
  perPage = ref("6");
const projects = ref<Project[]>([]),
  total = ref(0),
  loading = ref(false),
  error = ref(""),
  gameChoices = ref<string[]>([]);
const categories = computed(() =>
  [...new Set([category.value, ...projects.value.flatMap((p) => p.categories)])]
    .filter(Boolean)
    .slice(0, 20),
);
const pages = computed(() =>
  Math.max(
    1,
    Math.min(
      Math.ceil(total.value / Number(perPage.value)),
      Math.floor(10000 / Number(perPage.value)),
    ),
  ),
);
const hasFilters = computed(
  () => !!(query.value || category.value || loader.value || version.value),
);
const selectedTab = computed(() => tabs.find((t) => t.id === kind.value)!);
const activeIcon = computed(() => selectedTab.value.icon);
let timer: ReturnType<typeof setTimeout> | undefined;
let request = 0,
  controller: AbortController | undefined,
  disposed = false;
function reset() {
  query.value = "";
  category.value = "";
  loader.value = "";
  version.value = "";
}
function changeKind(value: Kind) {
  kind.value = value;
  reset();
}
async function search() {
  const current = ++request;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = "";
  projects.value = [];
  try {
    const result = await contentApi.search(
      {
        provider: source.value,
        kind: kind.value,
        query: query.value.trim(),
        category: category.value,
        loader: loader.value,
        gameVersion: version.value,
        sort: sort.value,
        offset: (page.value - 1) * Number(perPage.value),
        limit: Number(perPage.value),
      },
      controller.signal,
    );
    if (current === request && !disposed) {
      projects.value = result.projects;
      total.value = result.total;
    }
  } catch (e) {
    if (current === request && !disposed) {
      error.value = e instanceof Error ? e.message : String(e);
      total.value = 0;
    }
  } finally {
    if (current === request && !disposed) loading.value = false;
  }
}
watch(
  [kind, query, category, source, loader, version, sort, perPage],
  () => (page.value = 1),
);
watch(
  [kind, query, category, source, loader, version, sort, perPage, page],
  () => {
    request++;
    controller?.abort();
    projects.value = [];
    loading.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 250);
  },
);
onMounted(() => {
  void search();
  void content.init();
  void gameVersions()
    .then((v) => (gameChoices.value = v.slice(0, 150).map((v) => v.id)))
    .catch(() => {});
});
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
    (i) => kind.value !== "mods" || i.loader !== "vanilla",
  ),
);
let planRequest = 0;
let versionRequest = 0,
  trigger: HTMLElement | null = null;
async function open(projectValue: Project) {
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
  if (kind.value !== "modpacks" && !instanceId.value) return;
  versionLoading.value = true;
  try {
    const [list, files] = await Promise.all([
      contentApi.versions(
        source.value,
        project.value.id,
        kind.value,
        kind.value === "modpacks" ? null : instanceId.value,
      ),
      kind.value === "datapacks"
        ? instanceApi.entries(instanceId.value, "worlds")
        : Promise.resolve([]),
    ]);
    if (current !== versionRequest || disposed) return;
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
      source.value,
      project.value.id,
      selectedVersion.value,
      kind.value,
      kind.value === "modpacks" ? null : instanceId.value,
      name.value,
      kind.value === "datapacks" ? world.value : null,
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
async function openProvider(p: Project) {
  try {
    await contentApi.open(p.url);
  } catch (e) {
    error.value = String(e);
  }
}
const number = (n: number) =>
  Intl.NumberFormat("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
const size = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;
onBeforeUnmount(() => {
  disposed = true;
  request++;
  versionRequest++;
  clearTimeout(timer);
  controller?.abort();
  dialog.value?.close();
});
</script>
<template>
  <div class="discover-page">
    <section class="discover-heading">
      <div>
        <h1>Discover</h1>
        <p class="muted">Find content for your next Minecraft instance.</p>
      </div>
      <span class="discovery-preview-badge">{{
        source === "modrinth" ? "Modrinth" : "CurseForge"
      }}</span>
    </section>
    <div class="discover-tabs" role="group" aria-label="Content type">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :aria-pressed="kind === tab.id"
        :class="{ active: kind === tab.id }"
        @click="changeKind(tab.id)"
      >
        <component :is="tab.icon" :size="17" />{{ tab.label }}
      </button>
    </div>
    <div class="discover-layout">
      <section class="discover-results" aria-label="Project catalogue">
        <label class="search-box discover-search"
          ><Search :size="20" /><input
            v-model="query"
            :aria-label="'Search ' + selectedTab.label.toLowerCase()"
            :placeholder="
              'Search ' + selectedTab.label.toLowerCase() + '…'
            " /><button
            v-if="query"
            class="icon-button"
            aria-label="Clear discovery search"
            @click="query = ''"
          >
            <X :size="16" /></button
        ></label>
        <div class="discover-toolbar">
          <div class="discover-sort">
            <span>Sort by</span
            ><VersionPicker
              v-model="sort"
              label="Sort projects"
              :options="[
                { value: 'relevance', label: 'Relevance' },
                { value: 'downloads', label: 'Most downloaded' },
                { value: 'updated', label: 'Recently updated' },
              ]"
            />
          </div>
          <div class="discover-view-count">
            <span>Show</span
            ><VersionPicker
              v-model="perPage"
              label="Results per page"
              :options="[
                { value: '6', label: '6' },
                { value: '12', label: '12' },
              ]"
            />
          </div>
          <span class="discover-result-count" role="status">{{
            loading ? "Searching…" : `${number(total)} projects`
          }}</span>
        </div>
        <div v-if="error" class="discover-empty" role="alert">
          <h2>Couldn’t load projects</h2>
          <p>{{ error }}</p>
          <button class="button secondary" @click="search">Retry search</button
          ><RouterLink
            v-if="source === 'curseforge'"
            class="text-link"
            to="/settings#content-providers"
            >Set up CurseForge access</RouterLink
          >
        </div>
        <div v-else-if="loading" class="discover-empty" role="status">
          <Search :size="28" />
          <p>
            Searching {{ source === "modrinth" ? "Modrinth" : "CurseForge" }}…
          </p>
        </div>
        <div v-else-if="projects.length" class="discover-project-list">
          <article v-for="p in projects" :key="p.id" class="discover-project">
            <div class="discover-project-art blocks" aria-hidden="true">
              <component :is="activeIcon" :size="32" />
            </div>
            <div class="discover-project-body">
              <div class="discover-project-title">
                <h2>{{ p.name }}</h2>
                <span>by {{ p.author }}</span>
              </div>
              <p>{{ p.description }}</p>
              <div class="discover-tags">
                <span v-for="tag in p.categories.slice(0, 3)" :key="tag">{{
                  tag
                }}</span
                ><span :class="['discover-source-tag', source]">{{
                  source === "modrinth" ? "Modrinth" : "CurseForge"
                }}</span>
              </div>
            </div>
            <div class="discover-project-meta">
              <button
                class="discover-install"
                :disabled="!desktop || content.busy"
                :aria-label="'Install ' + p.name"
                @click="open(p)"
              >
                <Plus :size="15" />Install</button
              ><span><Download :size="13" />{{ number(p.downloads) }}</span
              ><button
                class="text-link content-project-link"
                :aria-label="'Open ' + p.name + ' on provider website'"
                @click="openProvider(p)"
              >
                <ExternalLink :size="13" />Project page
              </button>
            </div>
          </article>
        </div>
        <div v-else class="discover-empty">
          <Search :size="30" />
          <h2>No projects found</h2>
          <p>Try another search or clear your filters.</p>
          <button class="button secondary" @click="reset">
            Clear search &amp; filters
          </button>
        </div>
        <p v-if="!desktop" class="muted content-disclosure">
          Browse Modrinth here. Installing content and configuring CurseForge
          require the Windows desktop app.
        </p>
        <footer class="discover-pagination">
          <button
            class="button secondary"
            :disabled="page === 1 || loading"
            aria-label="Previous results page"
            @click="page--"
          >
            <ChevronLeft :size="16" /></button
          ><span>Page {{ page }} of {{ pages }}</span
          ><button
            class="button secondary"
            :disabled="page >= pages || loading"
            aria-label="Next results page"
            @click="page++"
          >
            <ChevronRight :size="16" />
          </button>
        </footer>
      </section>
      <aside class="discover-filters" aria-label="Discovery filters">
        <div class="discover-filter-heading">
          <SlidersHorizontal :size="17" />
          <h2>Filters</h2>
        </div>
        <fieldset>
          <legend>Source</legend>
          <button
            v-for="p in [
              { value: 'modrinth' as const, label: 'Modrinth' },
              { value: 'curseforge' as const, label: 'CurseForge' },
            ]"
            :key="p.value"
            :class="[
              'discover-filter-option',
              { selected: source === p.value },
            ]"
            :aria-pressed="source === p.value"
            @click="
              source = p.value;
              category = '';
            "
          >
            {{ p.label }}
          </button>
        </fieldset>
        <div class="discover-filter-field">
          <span>Game version</span
          ><VersionPicker
            v-model="version"
            label="Discover game version"
            :options="[
              { value: '', label: 'All versions' },
              ...[
                ...new Set([
                  ...store.instances.map((i) => i.minecraftVersion),
                  ...gameChoices,
                ]),
              ].map((value) => ({ value, label: value })),
            ]"
          />
        </div>
        <div
          v-if="kind === 'mods' || kind === 'modpacks'"
          class="discover-filter-field"
        >
          <span>Loader</span
          ><VersionPicker
            v-model="loader"
            label="Discover loader"
            :options="[
              { value: '', label: 'Any loader' },
              ...['fabric', 'forge', 'neoforge', 'quilt'].map((value) => ({
                value,
                label:
                  value === 'neoforge'
                    ? 'NeoForge'
                    : value[0]!.toUpperCase() + value.slice(1),
              })),
            ]"
          />
        </div>
        <fieldset>
          <legend>Categories</legend>
          <button
            :class="['discover-filter-option', { selected: !category }]"
            :aria-pressed="!category"
            @click="category = ''"
          >
            All categories</button
          ><button
            v-for="c in categories"
            :key="c"
            :class="['discover-filter-option', { selected: category === c }]"
            :aria-pressed="category === c"
            @click="category = c"
          >
            {{ c }}
          </button>
        </fieldset>
        <button class="discover-reset" :disabled="!hasFilters" @click="reset">
          <RotateCcw :size="13" />Reset filters
        </button>
        <p class="discover-sidebar-note">
          Results come from the selected provider. File availability and
          permissions are set by each author.
        </p>
      </aside>
    </div>
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
  </div>
</template>
<style scoped>
.content-project-link {
  border: 0;
  background: none;
  padding: 0;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 5px;
  text-align: left;
}
.content-disclosure {
  font-size: 12px;
  line-height: 1.6;
}
.content-install-dialog {
  width: min(620px, calc(100vw - 48px));
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
}
.content-install-dialog :deep(.version-picker),
.content-install-dialog .instance-field {
  margin-block: 18px;
}
.content-plan {
  margin-block: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 18px;
}
.content-plan h3 {
  margin: 0 0 10px;
}
.content-plan p {
  font-size: 13px;
  line-height: 1.6;
}
.content-plan ul {
  max-height: 140px;
  overflow: auto;
  padding-left: 20px;
  font-size: 13px;
}
.discover-empty .text-link {
  display: block;
  margin-top: 16px;
}
</style>

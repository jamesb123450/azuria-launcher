<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Search,
  Upload,
  Compass,
  RefreshCw,
  FolderOpen,
  Eye,
  Settings,
  ArrowLeftRight,
  Trash2,
  MoreVertical,
  X,
  Boxes,
  Download,
} from "@lucide/vue";
import { desktop } from "../api";
import { instanceApi, type FileEntry, type Section } from "../instance-api";
import { type Inventory, type InstalledProject } from "../content-api";
import { useContent } from "../stores/content";
import ContentIcon from "./ContentIcon.vue";
import ContentUpdateReview from "./ContentUpdateReview.vue";
import ContentVersionSwitcher from "./ContentVersionSwitcher.vue";
import ReleaseBadge from "./ReleaseBadge.vue";
import VersionPicker from "./VersionPicker.vue";
const props = defineProps<{
  id: string;
  loader: string;
  inventory: Inventory;
  checking: boolean;
  checkError: string;
  section?: string;
}>();
const emit = defineEmits<{ check: []; settings: [] }>();
const content = useContent(),
  switcher = ref<InstanceType<typeof ContentVersionSwitcher>>(),
  updateReview = ref<InstanceType<typeof ContentUpdateReview>>(),
  packDialog = ref<HTMLDialogElement>(),
  confirm = ref<HTMLDialogElement>();
type Row = FileEntry & { section: Section; path: string };
const rows = ref<Row[]>([]),
  busy = ref(false),
  error = ref(""),
  query = ref(""),
  category = ref(props.section ?? "all"),
  sort = ref("az"),
  packQuery = ref(""),
  packCategory = ref("all"),
  selected = ref<string[]>([]),
  pendingRemove = ref<Row[]>([]);
let request = 0,
  packTrigger: HTMLElement | null = null;
const categories = computed(() => [
  { id: "all", label: "All" },
  ...(props.loader === "vanilla" ? [] : [{ id: "mods", label: "Mods" }]),
  { id: "resourcePacks", label: "Resource packs" },
  { id: "shaderPacks", label: "Shader packs" },
]);
const folder = (s: Section) =>
  s === "mods"
    ? "mods"
    : s === "resourcePacks"
      ? "resourcepacks"
      : "shaderpacks";
const managed = (r: Row) =>
  props.inventory.pack?.files.includes(
    `${folder(r.section)}/${r.name.replace(/\.disabled$/, "")}`,
  ) ?? false;
const metadata = (r: Row) =>
  props.inventory.files.find(
    (f) =>
      f.name === r.name ||
      f.name.replace(/\.disabled$/, "") === r.name.replace(/\.disabled$/, ""),
  );
const title = (r: Row) =>
  metadata(r)?.project.name ?? r.name.replace(/\.disabled$/, "");
const projectPath = (r: Row) => {
  const f = metadata(r);
  return f
    ? `/discover/${f.provider ?? "modrinth"}/${r.section === "mods" ? "mods" : "resourcepacks"}/${f.project.id}`
    : "";
};
const filter = (list: Row[], text: string, kind: string) =>
  list
    .filter(
      (r) =>
        (kind === "all" || r.section === kind) &&
        `${title(r)} ${r.name}`.toLowerCase().includes(text.toLowerCase()),
    )
    .sort(
      (a, b) =>
        title(a).localeCompare(title(b)) * (sort.value === "za" ? -1 : 1),
    );
const additional = computed(() =>
  filter(
    rows.value.filter((r) => !managed(r)),
    query.value,
    category.value,
  ),
);
const packFiles = computed(() =>
  filter(rows.value.filter(managed), packQuery.value, packCategory.value),
);
const targets = computed(() =>
  rows.value.filter((r) => selected.value.includes(r.path) && !managed(r)),
);
const updateFor = (r: Row) =>
  props.inventory.projects.find(
    (p) =>
      p.project.id === metadata(r)?.project.id &&
      p.provider === (metadata(r)?.provider ?? "modrinth"),
  );
const updates = computed(() => {
  const result = new Map<string, InstalledProject>();
  for (const row of additional.value) {
    const item = updateFor(row);
    if (
      item?.latest &&
      (!selected.value.length || selected.value.includes(row.path))
    )
      result.set(`${item.provider}:${item.project.id}`, item);
  }
  return [...result.values()];
});
const discoverKind = computed(() =>
  category.value === "resourcePacks"
    ? "resourcepacks"
    : category.value === "shaderPacks"
      ? "resourcepacks"
      : props.loader === "vanilla"
        ? "resourcepacks"
        : "mods",
);
const discoverQuery = computed(() => ({
  instance: props.id,
  kind: discoverKind.value,
  ...(category.value === "shaderPacks" ? { query: "shader" } : {}),
}));
watch(
  () => props.section,
  (value) => {
    if (value) {
      category.value = value;
      query.value = "";
      selected.value = [];
    }
  },
);
function openCurrentFolder() {
  void instanceApi
    .open(
      props.id,
      category.value === "all" ? "root" : (category.value as Section),
    )
    .catch((e) => (error.value = String(e)));
}
function selectAll(event: Event) {
  if ((event.target as HTMLInputElement).checked)
    selected.value = [
      ...new Set([...selected.value, ...additional.value.map((r) => r.path)]),
    ];
  else
    selected.value = selected.value.filter(
      (p) => !additional.value.some((r) => r.path === p),
    );
}
async function refresh() {
  const token = ++request;
  error.value = "";
  busy.value = true;
  try {
    const result = await Promise.all(
      categories.value
        .filter((c) => c.id !== "all")
        .map(async (c) =>
          (await instanceApi.entries(props.id, c.id as Section)).map((r) => ({
            ...r,
            section: c.id as Section,
            path: `${c.id}/${r.name}`,
          })),
        ),
    );
    if (token === request) {
      rows.value = result.flat();
      selected.value = selected.value.filter((p) =>
        rows.value.some((r) => r.path === p),
      );
    }
  } catch (e) {
    if (token === request) error.value = String(e);
  } finally {
    if (token === request) busy.value = false;
  }
}
async function action(work: () => Promise<unknown>) {
  if (busy.value || content.busy) return;
  busy.value = true;
  error.value = "";
  let failure = "";
  try {
    await work();
  } catch (e) {
    failure = String(e);
  } finally {
    busy.value = false;
    await refresh();
    if (failure) error.value = failure;
  }
}
async function toggle(row: Row) {
  await action(() => instanceApi.toggle(props.id, row.section, row.name));
}
async function bulk(enabled: boolean) {
  await action(async () => {
    for (const row of targets.value) {
      if (row.enabled !== enabled)
        await instanceApi.toggle(props.id, row.section, row.name);
    }
  });
}
async function importFile() {
  const section = (
    category.value === "all"
      ? props.loader === "vanilla"
        ? "resourcePacks"
        : "mods"
      : category.value
  ) as Section;
  await action(() => instanceApi.import(props.id, section));
  emit("check");
}
function remove(list: Row[]) {
  pendingRemove.value = list;
  confirm.value?.showModal();
}
async function removeConfirmed() {
  const list = [...pendingRemove.value];
  confirm.value?.close();
  await action(async () => {
    for (const row of list)
      await instanceApi.remove(props.id, row.section, row.name);
  });
  emit("check");
}
async function openPack() {
  packTrigger = document.activeElement as HTMLElement;
  packQuery.value = "";
  packCategory.value = "all";
  await nextTick();
  packDialog.value?.showModal();
}
function closePack() {
  packDialog.value?.close();
  packTrigger?.focus();
}
function switchVersion(item: InstalledProject) {
  switcher.value?.open(item);
}
watch(
  () => props.id,
  () => {
    rows.value = [];
    query.value = "";
    category.value = props.section ?? "all";
    selected.value = [];
    closePack();
    void refresh();
  },
  { immediate: true },
);
watch(
  () => content.job?.stage,
  (stage) => {
    if (stage === "installed") void refresh();
  },
);
onBeforeUnmount(() => {
  request++;
  packDialog.value?.close();
  confirm.value?.close();
});
defineExpose({ refresh });
</script>
<template>
  <section class="instance-content-panel">
    <section v-if="inventory.pack" class="pack-card">
      <div class="pack-card-main">
        <ContentIcon :url="inventory.pack.project.iconUrl" />
        <div>
          <h2>Modpack content</h2>
          <p class="muted">
            {{ inventory.pack.mods }} mods ·
            {{ inventory.pack.resourcePacks }} resource packs
          </p>
        </div>
        <button class="button secondary" @click="openPack">
          <Eye :size="16" />View content</button
        ><button
          class="icon-button"
          aria-label="Pack instance settings"
          title="Settings"
          @click="emit('settings')"
        >
          <Settings :size="18" />
        </button>
      </div>
      <footer>
        <RouterLink
          :to="`/discover/${inventory.pack.provider}/modpacks/${inventory.pack.project.id}`"
          >{{ inventory.pack.project.name }}</RouterLink
        ><span>{{ inventory.pack.versionName }}</span
        ><button
          v-if="inventory.pack.latest || inventory.pack.missing"
          class="button secondary"
          :disabled="content.busy"
          @click="switchVersion(inventory.pack)"
        >
          {{
            inventory.pack.latest
              ? "Update available"
              : `Repair ${inventory.pack.missing} missing files`
          }}</button
        ><button
          class="pack-switch text-link"
          :disabled="content.busy"
          @click="switchVersion(inventory.pack)"
        >
          <ArrowLeftRight :size="15" />Switch version
        </button>
      </footer>
    </section>
    <div class="content-title" v-if="!section">
      <h2>{{ inventory.pack ? "Additional content" : "Instance content" }}</h2>
    </div>
    <div class="additional-toolbar content-command-bar">
      <input
        type="checkbox"
        aria-label="Select all additional content"
        :checked="
          additional.length > 0 &&
          additional.every((r) => selected.includes(r.path))
        "
        :disabled="!additional.length || busy || content.busy"
        @change="selectAll"
      />
      <label class="search-box"
        ><Search :size="17" /><input
          v-model="query"
          aria-label="Search additional content"
          :placeholder="`Search ${additional.length} ${category === 'mods' ? 'mods' : 'files'}…`"
      /></label>
      <VersionPicker
        v-model="sort"
        label="Sort content"
        :options="[
          { value: 'az', label: 'A–Z' },
          { value: 'za', label: 'Z–A' },
        ]"
      />
      <button
        class="button update-all-button"
        :disabled="
          !desktop || busy || content.busy || checking || !updates.length
        "
        @click="updateReview?.open(updates)"
      >
        <Download :size="15" />{{
          selected.length ? "Update selected" : "Update all"
        }}<span v-if="updates.length">({{ updates.length }})</span>
      </button>
      <RouterLink
        v-if="category !== 'shaderPacks'"
        class="button primary"
        :to="{ path: '/discover', query: discoverQuery }"
        ><Compass :size="16" />Add content</RouterLink
      ><button
        v-else
        class="button primary"
        :disabled="!desktop || busy || content.busy"
        @click="importFile"
      >
        <Upload :size="16" />Add shaders
      </button>
      <button
        class="icon-button"
        :disabled="!desktop"
        aria-label="Open content folder"
        @click="openCurrentFolder"
      >
        <FolderOpen :size="18" />
      </button>
      <details class="content-overflow">
        <summary class="icon-button" aria-label="Content tools">
          <MoreVertical :size="18" />
        </summary>
        <div>
          <button
            :disabled="!desktop || busy || content.busy"
            @click="importFile"
          >
            <Upload :size="15" />Upload files</button
          ><button :disabled="checking || content.busy" @click="emit('check')">
            <RefreshCw :size="15" />Check content updates</button
          ><button :disabled="busy" @click="refresh">
            <RefreshCw :size="15" />Refresh instance files
          </button>
        </div>
      </details>
    </div>
    <div
      v-if="!section"
      class="content-filter-tabs"
      role="group"
      aria-label="Content type"
    >
      <button
        v-for="c in categories"
        :key="c.id"
        :aria-pressed="category === c.id"
        @click="category = c.id"
      >
        {{ c.label }}
      </button>
    </div>
    <p v-if="checking" class="muted content-check-status" role="status">
      Checking for updates…
    </p>
    <div v-if="content.batchActive" class="content-batch-status" role="status">
      <span>Updating profile content…</span
      ><button
        class="text-link"
        :disabled="content.job?.stage === 'installing' || content.batchStopped"
        @click="content.cancel"
      >
        {{ content.batchStopped ? "Stopping…" : "Cancel remaining updates" }}
      </button>
    </div>
    <p
      v-if="
        !content.batchActive &&
        content.batchResult &&
        content.batchInstance === id
      "
      class="content-batch-result"
      role="status"
    >
      {{ content.batchResult }}
    </p>
    <p v-if="content.error" class="inline-error" role="alert">
      {{ content.error }}
    </p>
    <div v-if="selected.length" class="content-bulk">
      <span>{{ selected.length }} selected</span
      ><button
        class="button secondary"
        :disabled="busy || content.busy"
        @click="bulk(true)"
      >
        Enable</button
      ><button
        class="button secondary"
        :disabled="busy || content.busy"
        @click="bulk(false)"
      >
        Disable</button
      ><button
        class="icon-button danger"
        aria-label="Remove selected content"
        title="Remove selected"
        :disabled="busy || content.busy"
        @click="remove(targets)"
      >
        <Trash2 :size="16" />
      </button>
    </div>
    <p v-if="checkError" class="muted content-error">{{ checkError }}</p>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
    <p v-if="busy" class="muted" role="status">Reading instance files…</p>
    <p v-if="!desktop" class="muted">
      Local content is available in the desktop app.
    </p>
    <div class="content-table" role="table" aria-label="Additional content">
      <article
        v-for="row in additional"
        :key="row.path"
        class="content-table-row"
        role="row"
      >
        <input
          v-model="selected"
          type="checkbox"
          :value="row.path"
          :aria-label="'Select ' + title(row)"
        />
        <div class="content-project">
          <RouterLink
            v-if="projectPath(row)"
            :to="{ path: projectPath(row), query: { instance: id } }"
            ><ContentIcon :url="metadata(row)?.project.iconUrl" /></RouterLink
          ><ContentIcon v-else />
          <div>
            <RouterLink
              v-if="projectPath(row)"
              :to="{ path: projectPath(row), query: { instance: id } }"
              >{{ title(row) }}</RouterLink
            ><strong v-else>{{ title(row) }}</strong>
            <small class="installed-content-meta"
              ><img
                v-if="metadata(row)"
                :src="`/providers/${metadata(row)?.provider ?? 'modrinth'}.svg`"
                alt=""
              />{{ metadata(row)?.project.author || "Local file" }}<span>·</span
              ><span :title="row.name">{{
                metadata(row)?.versionName ||
                row.name.replace(/\.disabled$/, "")
              }}</span></small
            >
          </div>
        </div>
        <div class="content-row-actions">
          <button
            v-if="updateFor(row)"
            class="icon-button"
            :class="{ 'has-update': updateFor(row)?.latest }"
            :aria-label="
              (updateFor(row)?.latest
                ? 'Review update for '
                : 'Switch version of ') + title(row)
            "
            :title="
              updateFor(row)?.latest ? 'Update available' : 'Switch version'
            "
            :disabled="content.busy"
            @click="
              updateFor(row)?.latest
                ? updateReview?.open([updateFor(row)!])
                : switchVersion(updateFor(row)!)
            "
          >
            <Download v-if="updateFor(row)?.latest" :size="16" /><ArrowLeftRight
              v-else
              :size="16"
            /></button
          ><button
            class="content-switch"
            role="switch"
            :aria-checked="row.enabled"
            :aria-label="'Enable ' + row.name.replace(/\.disabled$/, '')"
            :disabled="busy || content.busy"
            @click="toggle(row)"
          >
            <span />
          </button>
          <details
            class="content-overflow"
            @keydown.esc="
              ($event.currentTarget as HTMLDetailsElement).open = false
            "
            @focusout="
              !($event.currentTarget as HTMLElement).contains(
                $event.relatedTarget as Node,
              ) && ($event.currentTarget as HTMLElement).removeAttribute('open')
            "
          >
            <summary
              class="icon-button"
              :aria-label="'More actions for ' + title(row)"
              title="More actions"
            >
              <Settings :size="17" />
            </summary>
            <div>
              <button
                v-if="updateFor(row)"
                :disabled="content.busy"
                @click="switchVersion(updateFor(row)!)"
              >
                <ArrowLeftRight :size="15" />Switch version
              </button>
              <button
                :disabled="busy || content.busy"
                :aria-label="'Remove ' + row.name"
                @click="remove([row])"
              >
                <Trash2 :size="15" />Remove file
              </button>
              <button
                @click="
                  instanceApi
                    .open(id, row.section)
                    .catch((e) => (error = String(e)))
                "
              >
                <FolderOpen :size="15" />Open folder
              </button>
            </div>
          </details>
        </div>
      </article>
      <p v-if="!busy && !additional.length" class="content-empty">
        {{
          query
            ? "No matching content."
            : "No additional content. Upload files or browse Discover to add some."
        }}
      </p>
    </div>
    <dialog
      ref="packDialog"
      class="pack-content-dialog"
      aria-labelledby="pack-content-title"
      @cancel.prevent="closePack"
    >
      <header>
        <ContentIcon :url="inventory.pack?.project.iconUrl" />
        <h2 id="pack-content-title">Modpack content</h2>
        <button
          class="icon-button"
          aria-label="Close pack content"
          title="Close"
          @click="closePack"
        >
          <X :size="19" />
        </button>
      </header>
      <div class="pack-content-tools">
        <label class="search-box"
          ><Search :size="17" /><input
            v-model="packQuery"
            aria-label="Search pack content"
            :placeholder="`Search ${rows.filter(managed).length} projects…`"
        /></label>
        <div
          class="content-filter-tabs"
          role="group"
          aria-label="Pack content type"
        >
          <button
            v-for="c in categories"
            :key="c.id"
            :aria-pressed="packCategory === c.id"
            @click="packCategory = c.id"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
      <p v-if="error" class="inline-error pack-action-error" role="alert">
        {{ error }}
      </p>
      <div class="pack-content-scroll">
        <div class="content-table" role="table" aria-label="Pack content">
          <div class="content-table-head pack" role="row">
            <span>Project</span><span>Version</span><span>Actions</span>
          </div>
          <article
            v-for="row in packFiles"
            :key="row.path"
            class="content-table-row pack"
            role="row"
          >
            <div class="content-project">
              <RouterLink
                v-if="projectPath(row)"
                :to="projectPath(row)"
                @click="closePack"
                ><ContentIcon
                  :url="metadata(row)?.project.iconUrl" /></RouterLink
              ><ContentIcon v-else />
              <div>
                <strong>{{ title(row) }}</strong
                ><small>{{
                  metadata(row)?.project.author || "Pack file"
                }}</small>
              </div>
            </div>
            <div class="content-file-version">
              <strong>{{ metadata(row)?.versionName || "Pack file" }}</strong
              ><span>{{ row.name.replace(/\.disabled$/, "") }}</span
              ><ReleaseBadge
                v-if="metadata(row)?.releaseType"
                :type="metadata(row)?.releaseType"
              />
            </div>
            <div class="content-row-actions">
              <button
                class="content-switch"
                role="switch"
                :aria-checked="row.enabled"
                :aria-label="'Enable ' + row.name.replace(/\.disabled$/, '')"
                :disabled="busy || content.busy"
                @click="toggle(row)"
              >
                <span />
              </button>
            </div>
          </article>
          <p v-if="!packFiles.length" class="content-empty">
            No matching pack files.
          </p>
        </div>
      </div>
      <footer>
        {{ inventory.pack?.mods }} mods ·
        {{ inventory.pack?.resourcePacks }} resource packs
      </footer>
    </dialog>
    <ContentUpdateReview ref="updateReview" :id="id" />
    <ContentVersionSwitcher ref="switcher" :id="id" />
    <dialog
      ref="confirm"
      class="instance-dialog small-dialog"
      aria-labelledby="remove-content-title"
    >
      <h2 id="remove-content-title">
        Remove
        {{
          pendingRemove.length === 1
            ? pendingRemove[0]?.name
            : `${pendingRemove.length} files`
        }}?
      </h2>
      <p class="muted">Files will be moved to Azuria’s local trash.</p>
      <footer class="dialog-actions">
        <button class="button secondary" @click="confirm?.close()">
          Cancel</button
        ><button class="button danger" @click="removeConfirmed">Remove</button>
      </footer>
    </dialog>
  </section>
</template>
<style scoped>
.pack-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel);
  margin: 24px 0;
  overflow: hidden;
}
.pack-card-main {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
}
.pack-card-main > div {
  flex: 1;
}
.pack-card h2 {
  margin: 0 0 8px;
  font-size: 19px;
}
.pack-card p {
  margin: 0;
  font-size: 12px;
}
.pack-card footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}
.pack-card a {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.pack-switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: none;
  border: 0;
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
}
.content-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 25px 0 18px;
}
.content-title h2 {
  margin: 0;
  flex: 1;
  font-size: 19px;
}
.content-title span {
  font-size: 11px;
}
.additional-toolbar {
  display: flex;
  gap: 10px;
}
.additional-toolbar .search-box {
  flex: 1;
  min-width: 120px;
}
.additional-toolbar .button {
  white-space: nowrap;
}
.content-filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 20px;
  flex-wrap: wrap;
}
.content-filter-row > :last-child {
  margin-left: auto;
}
.content-filter-row :deep(.version-picker) {
  width: 155px;
}
.content-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.content-filter-tabs button {
  border: 1px solid var(--border);
  background: none;
  border-radius: 8px;
  padding: 7px 11px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.content-filter-tabs button[aria-pressed="true"] {
  color: var(--blue);
  background: var(--accent-wash);
  border-color: var(--blue);
}
.content-table {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: visible;
  background: var(--panel);
}
.content-table-head,
.content-table-row {
  display: grid;
  grid-template-columns: 20px minmax(160px, 1.2fr) minmax(130px, 1fr) 142px;
  gap: 14px;
  padding: 14px 16px;
  align-items: center;
}
.content-table-head {
  font-size: 11px;
  color: var(--muted);
  border-radius: 12px 12px 0 0;
}
.content-table-head > :last-child {
  justify-self: end;
}
.content-table-row {
  border-top: 1px solid var(--border);
  min-height: 83px;
}
.content-table-row > input {
  accent-color: var(--blue);
}
.content-project {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.content-project :deep(.content-icon) {
  width: 42px;
  height: 42px;
  border-radius: 9px;
}
.content-project > div,
.content-file-version {
  min-width: 0;
}
.content-project a,
.content-project strong {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
  font-size: 13px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content-project a:hover {
  text-decoration: underline;
}
.content-project small {
  display: block;
  color: var(--muted);
  font-size: 11px;
  margin-top: 5px;
}
.content-file-version > strong {
  display: block;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content-file-version > span:not(.release-badge) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
  margin: 5px 0;
}
.content-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.content-row-actions .icon-button {
  width: 28px;
  height: 30px;
}
.content-row-actions .has-update {
  color: var(--blue);
  background: var(--accent-wash);
}
.content-row-actions .content-switch {
  flex-shrink: 0;
}
.content-empty {
  font-size: 13px;
  color: var(--muted);
  padding: 24px;
  line-height: 1.7;
}
.content-error {
  font-size: 12px;
  line-height: 1.6;
}
.content-bulk {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  margin: 12px 0;
}
.content-overflow {
  position: relative;
}
.content-overflow summary {
  list-style: none;
  cursor: pointer;
}
.content-overflow summary::-webkit-details-marker {
  display: none;
}
.content-overflow[open] > div {
  position: absolute;
  right: 0;
  top: 34px;
  z-index: 8;
  min-width: 160px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: 0 12px 35px #0004;
  padding: 6px;
}
.content-overflow button {
  display: flex;
  gap: 9px;
  align-items: center;
  border: 0;
  background: none;
  border-radius: 7px;
  color: var(--text);
  padding: 10px;
  width: 100%;
  white-space: nowrap;
  font-size: 12px;
  cursor: pointer;
}
.content-overflow button:hover {
  background: var(--hover);
}
.pack-content-dialog {
  width: min(1000px, calc(100vw - 60px));
  height: min(720px, calc(100dvh - 70px));
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  overflow: hidden;
}
.pack-content-dialog[open] {
  display: flex;
  flex-direction: column;
}
.pack-content-dialog header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.pack-content-dialog header h2 {
  flex: 1;
  font-size: 21px;
  margin: 0;
}
.pack-content-dialog header :deep(.content-icon) {
  width: 44px;
  height: 44px;
}
.pack-content-tools {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border);
}
.pack-content-tools .content-filter-tabs {
  margin-top: 13px;
}
.pack-action-error {
  margin: 12px 24px;
  font-size: 12px;
  line-height: 1.6;
}
.pack-content-scroll {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.pack-content-scroll .content-table {
  border: 0;
  border-radius: 0;
}
.content-table-head.pack,
.content-table-row.pack {
  grid-template-columns: minmax(190px, 1.2fr) minmax(160px, 1fr) 80px;
  padding-inline: 24px;
}
.pack-content-dialog footer {
  padding: 17px 24px;
  color: var(--muted);
  font-size: 12px;
  border-top: 1px solid var(--border);
}
@media (max-width: 1000px) {
  .content-table-head,
  .content-table-row {
    grid-template-columns: 18px minmax(125px, 1.1fr) minmax(100px, 1fr) 135px;
    gap: 9px;
    padding-inline: 10px;
  }
  .content-project {
    gap: 8px;
  }
  .content-project :deep(.content-icon) {
    width: 34px;
    height: 34px;
  }
  .content-filter-row {
    gap: 8px;
  }
  .additional-toolbar .button {
    padding-inline: 10px;
    font-size: 12px;
  }
}
</style>
<style scoped>
.content-command-bar {
  gap: 9px;
  margin: 12px 0 22px;
  flex-wrap: wrap;
}
.content-command-bar > input {
  flex: 0 0 15px;
  accent-color: var(--pink);
}
.content-command-bar .search-box {
  flex: 1 1 180px;
  min-width: 150px;
}
.content-command-bar :deep(.version-picker) {
  width: 82px;
  min-width: 82px;
}
.content-command-bar .button {
  font-size: 11px;
  gap: 6px;
  min-height: 38px;
  padding: 9px 11px;
  white-space: nowrap;
}
.update-all-button {
  background: color-mix(in srgb, var(--pink) 12%, var(--panel));
  color: var(--pink);
  border: 1px solid color-mix(in srgb, var(--pink) 20%, transparent);
}
.content-table {
  border: 0;
  background: transparent;
  overflow: visible;
  border-radius: 0;
}
.content-table > .content-table-row:not(.pack) {
  grid-template-columns: 18px minmax(0, 1fr) auto;
  padding: 17px 4px;
  gap: 15px;
  border-bottom: 1px solid var(--border);
  background: transparent;
}
.content-project :deep(.content-icon) {
  width: 47px;
  height: 47px;
  border-radius: 10px;
}
.content-project {
  gap: 15px;
}
.content-project > div > strong,
.content-project > div > a {
  font-size: 14px;
  font-weight: 650;
}
.content-project .installed-content-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  margin-top: 7px;
  min-width: 0;
}
.installed-content-meta > img {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}
.installed-content-meta > span:last-child {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.content-row-actions {
  gap: 8px;
}
.content-row-actions .has-update {
  color: var(--pink);
  background: color-mix(in srgb, var(--pink) 12%, var(--panel));
}
.content-check-status {
  font-size: 11px;
}
.content-batch-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding: 13px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 9px;
  margin-bottom: 16px;
  font-size: 12px;
}
.content-batch-status button {
  font-size: 11px;
}
@media (max-width: 1050px) {
  .content-command-bar .search-box {
    flex-basis: calc(100% - 35px);
  }
  .content-command-bar .button {
    flex: 1;
    justify-content: center;
  }
  .content-project {
    gap: 9px;
  }
  .content-table > .content-table-row:not(.pack) {
    gap: 9px;
  }
  .content-row-actions {
    gap: 4px;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { X, Search, ArrowDownToLine, FileText } from "@lucide/vue";
import {
  contentApi,
  type InstalledProject,
  type Version,
  type VersionDetails,
  type Plan,
} from "../content-api";
import { useContent } from "../stores/content";
import ContentIcon from "./ContentIcon.vue";
import ReleaseBadge from "./ReleaseBadge.vue";
import ProjectDescription from "./ProjectDescription.vue";
const props = defineProps<{ id: string }>();
const content = useContent(),
  dialog = ref<HTMLDialogElement>(),
  item = ref<InstalledProject>(),
  versions = ref<Version[]>([]),
  selected = ref(""),
  query = ref(""),
  details = ref<VersionDetails>(),
  plan = ref<Plan>(),
  busy = ref(false),
  detailBusy = ref(false),
  error = ref("");
let request = 0,
  detailRequest = 0,
  planRequest = 0,
  trigger: HTMLElement | null = null;
const chosen = computed(() =>
  versions.value.find((v) => v.id === selected.value),
);
const visible = computed(() =>
  versions.value.filter((v) =>
    v.name.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
async function open(project: InstalledProject) {
  trigger = document.activeElement as HTMLElement;
  item.value = project;
  versions.value = [];
  selected.value = "";
  details.value = undefined;
  plan.value = undefined;
  query.value = "";
  error.value = "";
  busy.value = true;
  const token = ++request;
  await nextTick();
  dialog.value?.showModal();
  try {
    const list = await contentApi.versions(
      project.provider,
      project.project.id,
      project.kind,
      props.id,
    );
    if (token !== request) return;
    versions.value = list;
    selected.value =
      project.latest && list.some((v) => v.id === project.latest)
        ? project.latest
        : (list.find((v) => v.id === project.version)?.id ?? list[0]?.id ?? "");
  } catch (e) {
    if (token === request) error.value = String(e);
  } finally {
    if (token === request) busy.value = false;
  }
}
function close() {
  request++;
  detailRequest++;
  planRequest++;
  busy.value = false;
  dialog.value?.close();
  trigger?.focus();
}
watch(selected, async (version) => {
  planRequest++;
  plan.value = undefined;
  details.value = undefined;
  error.value = "";
  if (!version || !item.value) return;
  const token = ++detailRequest;
  detailBusy.value = true;
  try {
    const result = await contentApi.version(
      item.value.provider,
      item.value.project.id,
      version,
    );
    if (token === detailRequest) details.value = result;
  } catch (e) {
    if (token === detailRequest) error.value = String(e);
  } finally {
    if (token === detailRequest) detailBusy.value = false;
  }
});
async function review() {
  if (!item.value || !selected.value) return;
  busy.value = true;
  error.value = "";
  const token = ++planRequest;
  try {
    const result = await contentApi.updatePlan(
      props.id,
      item.value.provider,
      item.value.project.id,
      selected.value,
    );
    if (token === planRequest) plan.value = result;
  } catch (e) {
    if (token === planRequest) error.value = String(e);
  } finally {
    if (token === planRequest) busy.value = false;
  }
}
async function apply() {
  if (!plan.value) return;
  await content.install(plan.value.id);
  if (content.error) error.value = content.error;
  else close();
}
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(
        new Date(value),
      )
    : "";
onBeforeUnmount(close);
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="version-switcher"
    aria-labelledby="version-switch-title"
    @cancel.prevent="close"
  >
    <header>
      <ContentIcon :url="item?.project.iconUrl" />
      <h2 id="version-switch-title">
        {{
          item?.kind === "modpacks"
            ? "Switch modpack version"
            : "Switch content version"
        }}
      </h2>
      <button
        class="icon-button"
        title="Close"
        aria-label="Close version switcher"
        @click="close"
      >
        <X :size="18" />
      </button>
    </header>
    <div class="switch-layout">
      <aside aria-label="Available versions">
        <label class="search-box"
          ><Search :size="15" /><input
            v-model="query"
            aria-label="Search versions"
            placeholder="Search versions…"
        /></label>
        <p v-if="busy && !versions.length" class="muted" role="status">
          Loading versions…
        </p>
        <div class="switch-list">
          <button
            v-for="v in visible"
            :key="v.id"
            :class="{ selected: selected === v.id }"
            :aria-pressed="selected === v.id"
            :disabled="busy"
            @click="selected = v.id"
          >
            <ReleaseBadge :type="v.releaseType" /><span>{{ v.name }}</span
            ><small v-if="v.id === item?.version">Current</small>
          </button>
        </div>
        <p v-if="!busy && !visible.length" class="muted">
          No compatible versions found.
        </p>
      </aside>
      <section class="switch-detail">
        <template v-if="chosen"
          ><div class="switch-version-heading">
            <h3>{{ chosen.name }}</h3>
            <ReleaseBadge :type="chosen.releaseType" /><time>{{
              date(details?.version.published || chosen.published)
            }}</time>
          </div>
          <p class="switch-version-meta muted">
            <FileText :size="15" />Changelog · {{ chosen.loaders.join(", ") }} ·
            {{ chosen.gameVersions.join(", ") }}
          </p>
          <p v-if="detailBusy" role="status" class="muted">
            Loading changelog…
          </p>
          <ProjectDescription
            v-else-if="details?.changelog"
            :body="details.changelog"
            :html="details.html"
          />
          <p v-else-if="!error" class="muted">
            No changelog was published for this version.
          </p>
          <div v-if="plan" class="switch-review">
            <strong>Ready to install {{ plan.preview.files }} files</strong>
            <p>
              Worlds and additional content are kept. Replaced managed files are
              backed up; edited configuration is preserved.
            </p>
          </div></template
        >
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      </section>
    </div>
    <footer>
      <button class="button secondary" @click="close">Cancel</button
      ><button
        v-if="!plan"
        class="button primary"
        :disabled="busy || !selected || content.busy"
        @click="review"
      >
        <ArrowDownToLine :size="16" />{{
          busy
            ? "Checking files…"
            : `Review ${selected === item?.version ? "repair" : "update"}${chosen ? " to " + chosen.name : ""}`
        }}</button
      ><button
        v-else
        class="button primary"
        :disabled="content.busy"
        @click="apply"
      >
        <ArrowDownToLine :size="16" />{{
          selected === item?.version ? "Repair" : "Update to"
        }}
        {{ chosen?.name }}
      </button>
    </footer>
  </dialog>
</template>
<style scoped>
.version-switcher {
  width: min(980px, calc(100vw - 60px));
  height: min(700px, calc(100dvh - 70px));
  max-height: calc(100dvh - 70px);
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  background: var(--panel);
  color: var(--text);
  overflow: hidden;
}
.version-switcher[open] {
  display: flex;
  flex-direction: column;
}
.version-switcher header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.version-switcher header h2 {
  flex: 1;
  font-size: 19px;
  margin: 0;
}
.version-switcher header :deep(.content-icon) {
  width: 44px;
  height: 44px;
}
.switch-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}
.switch-layout aside {
  border-right: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.switch-layout aside .search-box {
  flex: none;
  height: 38px;
  min-height: 38px;
  max-height: 38px;
}
.switch-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 12px;
}
.switch-list button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: 8px;
  color: var(--text);
  padding: 11px 8px;
  cursor: pointer;
  font-size: 12px;
}
.switch-list button:hover {
  background: var(--hover);
}
.switch-list button.selected {
  background: var(--accent-wash);
  box-shadow: inset 2px 0 var(--blue);
}
.switch-list button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.switch-list small {
  color: var(--muted);
  font-size: 10px;
  margin-left: auto;
}
.switch-detail {
  overflow: auto;
  padding: 22px;
  background: var(--bg);
}
.switch-version-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.switch-version-heading h3 {
  font-size: 21px;
  margin: 0;
}
.switch-version-heading time {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}
.switch-version-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.6;
  margin-bottom: 24px;
}
.version-switcher footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 16px 22px;
  border-top: 1px solid var(--border);
}
.switch-review {
  padding: 16px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  margin-top: 22px;
  font-size: 13px;
}
.switch-review p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--muted);
}
@media (max-width: 950px) {
  .switch-layout {
    grid-template-columns: 215px minmax(0, 1fr);
  }
  .switch-detail {
    padding: 18px;
  }
  .version-switcher footer .button {
    max-width: calc(100% - 90px);
    white-space: normal;
  }
}
</style>

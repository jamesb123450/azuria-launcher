<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  Plus,
  Search,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Star,
  SlidersHorizontal,
  Copy,
  Trash2,
  Layers3,
  LayoutGrid,
  List,
  ChevronDown,
  X,
  Folder,
} from "@lucide/vue";
import LaunchControl from "../components/LaunchControl.vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import VersionPicker from "../components/VersionPicker.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import { versionArt } from "../lib/version-art";
import { useBehaviour } from "../stores/behaviour";
import { useLauncher } from "../stores/launcher";
import { useUpdates } from "../stores/updates";
import type { Instance } from "../types";
import { LOADERS, loaderName } from "../types";
import { useRouter } from "vue-router";
const router = useRouter();
const store = useLauncher();
const behaviour = useBehaviour();
const updates = useUpdates();
const search = ref("");
const filter = ref("all");
const sort = ref("newest");
const grouping = ref("none");
const collapsed = ref(new Set<string>());
const jumpOpen = ref(true);
const showDialog = ref(false);
const editing = ref<Instance>();
const duplicate = ref(false);
const deleting = ref<Instance>();
const deleteDialog = ref<HTMLDialogElement>();
const deleteCancel = ref<HTMLButtonElement>();
const filtersOpen = ref(false);
const contextOverride = ref<boolean>();
const contextOpen = computed({
  get: () => contextOverride.value ?? !behaviour.options.hideRightSidebar,
  set: (value) => (contextOverride.value = value),
});
watch(
  () => behaviour.options.hideRightSidebar,
  () => (contextOverride.value = undefined),
);
const actionMenu = ref<string>();
const layoutOverride = ref<"grid" | "list">();
const layout = computed({
  get: () =>
    layoutOverride.value ??
    (behaviour.options.compactLibrary ? "list" : "grid"),
  set: (value: "grid" | "list") => (layoutOverride.value = value),
});
watch(
  () => behaviour.options.compactLibrary,
  () => (layoutOverride.value = undefined),
);
const recent = computed(() => {
  const newest = [...store.instances].sort((a, b) => b.createdAt - a.createdAt);
  return newest.filter((i) => i.id !== store.selected?.id).slice(0, 3);
});
const items = computed(() =>
  [...store.instances]
    .filter(
      (i) =>
        i.name.toLowerCase().includes(search.value.toLowerCase()) &&
        (filter.value === "all" ||
          (filter.value === "favorites"
            ? i.favorite
            : i.loader === filter.value)),
    )
    .sort((a, b) =>
      sort.value === "name"
        ? a.name.localeCompare(b.name)
        : b.createdAt - a.createdAt,
    ),
);
const groups = computed(() => {
  if (grouping.value === "none")
    return [{ key: "all", title: "All instances", items: items.value }];
  const buckets =
    grouping.value === "favorites"
      ? [
          {
            key: "favorite",
            title: "Favourites",
            match: (i: Instance) => i.favorite,
          },
          {
            key: "other",
            title: "Other instances",
            match: (i: Instance) => !i.favorite,
          },
        ]
      : LOADERS.map((loader) => ({
          key: loader.id,
          title: loader.name,
          match: (i: Instance) => i.loader === loader.id,
        }));
  return buckets
    .map((group) => ({
      key: group.key,
      title: group.title,
      items: items.value.filter(group.match),
    }))
    .filter((group) => group.items.length);
});
function toggleGroup(key: string) {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}
function closeActions() {
  const trigger = document.getElementById("more-" + actionMenu.value);
  actionMenu.value = undefined;
  trigger?.focus();
}
function open(instance?: Instance, copy = false) {
  store.saveError = "";
  editing.value = instance;
  duplicate.value = copy;
  showDialog.value = true;
}
function created(item: Instance) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(item.createdAt));
}
let deletionFocus: HTMLElement | null = null;
async function confirmDelete(item: Instance) {
  store.deleteError = "";
  deletionFocus = document.activeElement as HTMLElement;
  deleting.value = item;
  deleteDialog.value?.showModal();
  await nextTick();
  deleteCancel.value?.focus();
}
function closeDelete() {
  deleteDialog.value?.close();
  deleting.value = undefined;
  deletionFocus?.focus();
}
async function remove() {
  if (deleting.value && (await store.remove(deleting.value.id))) closeDelete();
}
onBeforeUnmount(closeDelete);
</script>
<template>
  <div :class="['play-page', { 'context-collapsed': !contextOpen }]">
    <div class="play-main" :aria-busy="store.loading || store.busy">
      <div class="library-page-heading">
        <h2>Profiles</h2>
        <button
          class="button secondary context-toggle"
          :aria-expanded="contextOpen"
          aria-controls="launcher-context"
          @click="contextOpen = !contextOpen"
        >
          <PanelRightClose v-if="contextOpen" :size="16" /><PanelRightOpen
            v-else
            :size="16"
          />
          Friends &amp; ads
        </button>
      </div>
      <section class="library-section" aria-labelledby="instances-heading">
        <h2 id="instances-heading">
          Your instances <span class="count">{{ store.instances.length }}</span>
        </h2>
        <div class="library-action-row">
          <label class="search-box"
            ><Search :size="17" /><input
              v-model="search"
              aria-label="Search instances"
              placeholder="Search your library" /><button
              v-if="search"
              class="icon-button"
              @click="search = ''"
              aria-label="Clear search"
            >
              <X :size="14" /></button
          ></label>
          <button
            class="button primary"
            :disabled="store.loading || store.busy || !store.libraryReady"
            @click="open()"
          >
            <Plus :size="17" /> New profile
          </button>
        </div>
        <div class="library-toolbar">
          <button
            class="button secondary"
            :aria-expanded="filtersOpen"
            aria-controls="library-filters"
            @click="filtersOpen = !filtersOpen"
          >
            <SlidersHorizontal :size="15" /> Filters &amp; sorting
          </button>
          <button
            v-if="filter !== 'all'"
            class="button secondary applied-filter"
            @click="filter = 'all'"
          >
            {{
              filter === "favorites"
                ? "Favourites"
                : loaderName(filter as Instance["loader"])
            }}
            <X :size="14" /><span>Clear filter</span>
          </button>
          <div class="view-switch" role="group" aria-label="Library layout">
            <button
              :class="{ active: layout === 'grid' }"
              :aria-pressed="layout === 'grid'"
              aria-label="Grid view"
              @click="layout = 'grid'"
            >
              <LayoutGrid :size="16" /></button
            ><button
              :class="{ active: layout === 'list' }"
              :aria-pressed="layout === 'list'"
              aria-label="List view"
              @click="layout = 'list'"
            >
              <List :size="17" />
            </button>
          </div>
        </div>
        <div
          v-if="filtersOpen"
          id="library-filters"
          class="library-filter-panel"
        >
          <div class="library-select-control">
            <SlidersHorizontal :size="15" /><VersionPicker
              v-model="sort"
              label="Sort instances"
              :options="[
                { value: 'newest', label: 'Newest first' },
                { value: 'name', label: 'Name A–Z' },
              ]"
            />
          </div>
          <div class="library-select-control library-group-control">
            <Folder :size="15" /><VersionPicker
              v-model="grouping"
              label="Group instances"
              :options="[
                { value: 'loader', label: 'Group by loader' },
                { value: 'favorites', label: 'Group by favourites' },
                { value: 'none', label: 'No grouping' },
              ]"
            />
          </div>
          <div class="filter-tabs" role="group" aria-label="Filter instances">
            <button
              v-for="tab in [
                { id: 'all', label: 'All' },
                { id: 'favorites', label: 'Favourites' },
                ...LOADERS.map((loader) => ({
                  id: loader.id,
                  label: loader.name,
                })),
              ]"
              :key="tab.id"
              :class="{ active: filter === tab.id }"
              :aria-pressed="filter === tab.id"
              @click="filter = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>
        <div v-if="store.loading" class="empty-state" role="status">
          Opening your library…
        </div>
        <div v-else-if="store.loadError" class="empty-state">
          <div>
            <h3>We couldn’t open your library.</h3>
            <p class="muted" role="alert">{{ store.loadError }}</p>
          </div>
          <button class="button secondary" @click="store.init">Retry</button>
        </div>
        <div v-else-if="!items.length" class="empty-state">
          <span class="empty-icon"><Layers3 :size="24" /></span>
          <div>
            <h3>
              {{
                store.instances.length
                  ? "No matching setups."
                  : "No saved setups yet"
              }}
            </h3>
            <p class="muted">
              {{
                store.instances.length
                  ? "Try another search or filter."
                  : "Create separate instances for different versions and mod loaders."
              }}
            </p>
          </div>
          <button
            v-if="store.instances.length"
            class="button secondary"
            @click="
              search = '';
              filter = 'all';
            "
          >
            Clear filters
          </button>
        </div>
        <section
          v-for="group in groups"
          v-else
          :key="group.key"
          class="instance-group"
        >
          <button
            class="group-heading"
            :aria-expanded="!collapsed.has(group.key)"
            :aria-controls="'group-' + group.key"
            @click="toggleGroup(group.key)"
          >
            <ChevronDown
              :size="16"
              :class="{ flipped: !collapsed.has(group.key) }"
            />
            <h3>{{ group.title }}</h3>
            <span class="count">{{ group.items.length }}</span>
          </button>
          <div
            v-if="!collapsed.has(group.key)"
            :id="'group-' + group.key"
            :class="['instance-grid', { 'list-layout': layout === 'list' }]"
          >
            <article
              v-for="item in group.items"
              :key="item.id"
              :class="[
                'instance-card',
                { selected: store.selected?.id === item.id },
              ]"
            >
              <button
                class="instance-select"
                :aria-label="'Open ' + item.name"
                @click="
                  store.selectedId = item.id;
                  router.push(`/instances/${item.id}`);
                "
              >
                <span
                  class="profile-cover"
                  :style="{
                    backgroundImage: `url(${versionArt[item.minecraftVersion.split('.').slice(0, 2).join('.')]?.image || '/scenery/home-panorama.webp'})`,
                  }"
                ></span
                ><span class="tile-art"
                  ><InstanceIcon
                    :loader="item.loader"
                    :seed="item.id"
                    :icon="item.icon" /></span
                ><span class="instance-title"
                  ><h3>{{ item.name }}</h3>
                  <span class="instance-version"
                    >{{ loaderName(item.loader) }}
                    {{ item.minecraftVersion }}</span
                  ></span
                >
              </button>
              <button
                class="favorite-button icon-button"
                :aria-label="
                  (item.favorite ? 'Unfavourite ' : 'Favourite ') + item.name
                "
                :aria-pressed="item.favorite"
                :disabled="store.busy || store.loading || !store.libraryReady"
                @click="store.favorite(item.id)"
              >
                <Star
                  :size="14"
                  :fill="item.favorite ? 'currentColor' : 'none'"
                />
              </button>
              <div class="card-bottom">
                <LaunchControl
                  :instance="item"
                  monitor
                  return-home
                  compact-label
                />
                <div class="card-tools">
                  <button
                    class="icon-button"
                    :aria-label="'Edit ' + item.name"
                    :disabled="
                      store.busy || store.loading || !store.libraryReady
                    "
                    @click="open(item)"
                  >
                    <SlidersHorizontal :size="14" /> Edit
                  </button>
                  <div
                    class="instance-more"
                    @keydown.esc.stop="closeActions"
                    @focusout="
                      (event) => {
                        if (
                          !(event.currentTarget as HTMLElement).contains(
                            event.relatedTarget as Node,
                          )
                        )
                          actionMenu = undefined;
                      }
                    "
                  >
                    <button
                      class="icon-button"
                      :id="'more-' + item.id"
                      :aria-label="'More actions for ' + item.name"
                      :aria-expanded="actionMenu === item.id"
                      :aria-controls="'actions-' + item.id"
                      @click="
                        actionMenu =
                          actionMenu === item.id ? undefined : item.id
                      "
                    >
                      <MoreHorizontal :size="18" />
                    </button>
                    <div
                      v-if="actionMenu === item.id"
                      :id="'actions-' + item.id"
                      class="instance-action-menu"
                    >
                      <button
                        class="button secondary"
                        :aria-label="'Copy settings for ' + item.name"
                        :disabled="
                          store.busy || store.loading || !store.libraryReady
                        "
                        @click="
                          closeActions();
                          open(item, true);
                        "
                      >
                        <Copy :size="14" /> Copy settings</button
                      ><button
                        class="icon-button danger"
                        :aria-label="'Delete ' + item.name"
                        :disabled="
                          store.busy || store.loading || !store.libraryReady
                        "
                        @click="
                          closeActions();
                          confirmDelete(item);
                        "
                      >
                        <Trash2 :size="14" /> Remove instance
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </section>
    </div>
    <CommunitySidebar v-if="contextOpen" id="launcher-context" ads-only />
  </div>
  <InstanceDialog
    v-if="showDialog"
    :instance="editing"
    :duplicate="duplicate"
    @close="showDialog = false"
  />
  <dialog
    ref="deleteDialog"
    class="instance-dialog small-dialog"
    aria-labelledby="delete-title"
    @cancel.prevent="!store.busy && closeDelete()"
  >
    <h2 id="delete-title">Remove {{ deleting?.name }}?</h2>
    <p class="muted">
      This removes the instance from your library. Desktop instance files are
      moved to Azuria’s trash folder, not permanently erased.
    </p>
    <p v-if="store.deleteError" role="alert" class="inline-error">
      {{ store.deleteError }}
    </p>
    <div class="dialog-actions">
      <button
        ref="deleteCancel"
        class="button secondary"
        :disabled="store.busy || store.loading || !store.libraryReady"
        @click="closeDelete"
      >
        Keep instance</button
      ><button
        class="button danger-button"
        :disabled="store.busy || store.loading || !store.libraryReady"
        @click="remove"
      >
        {{ store.busy ? "Removing…" : "Remove instance" }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.play-page .instance-grid:not(.list-layout) {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
.play-page .instance-grid:not(.list-layout) .instance-card {
  overflow: hidden;
  border-radius: 16px;
  position: relative;
  background: var(--panel-soft);
}
.profile-cover {
  display: block;
  height: 145px;
  width: 100%;
  background-size: cover;
  background-position: center;
  border-bottom: 1px solid var(--border);
}
.instance-grid:not(.list-layout) .instance-select {
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
}
.instance-grid:not(.list-layout) .tile-art {
  display: none;
}
.instance-grid:not(.list-layout) .instance-title {
  padding: 20px 20px 12px;
}
.instance-grid:not(.list-layout) .instance-title h3 {
  font-size: 19px;
}
.instance-grid:not(.list-layout) .card-bottom {
  padding: 8px 20px 18px;
}
.list-layout .profile-cover {
  display: none;
}
</style>

<style scoped>
.play-page :deep(.community-ads) {
  margin: auto 0;
  align-content: center;
}
.instance-grid:not(.list-layout) .card-bottom {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.card-bottom :deep(.launch-control) {
  flex: 1;
}
.card-bottom :deep(.launch-control > .button) {
  width: 100%;
  justify-content: center;
}
.card-bottom :deep(.launch-hint) {
  display: none;
}
</style>

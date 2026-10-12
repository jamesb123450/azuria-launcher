<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import {
  Plus,
  Search,
  Play,
  Star,
  SlidersHorizontal,
  Copy,
  Trash2,
  ArrowUpRight,
  Layers3,
  LayoutGrid,
  List,
  ChevronDown,
  Check,
  Circle,
  UserRound,
  X,
  Folder,
} from "@lucide/vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import { useLauncher } from "../stores/launcher";
import { useUpdates } from "../stores/updates";
import type { Instance } from "../types";
const store = useLauncher();
const updates = useUpdates();
const search = ref("");
const filter = ref("all");
const sort = ref("newest");
const grouping = ref("loader");
const collapsed = ref(new Set<string>());
const jumpOpen = ref(true);
const showDialog = ref(false);
const editing = ref<Instance>();
const duplicate = ref(false);
const deleting = ref<Instance>();
const deleteDialog = ref<HTMLDialogElement>();
const deleteCancel = ref<HTMLButtonElement>();
const launchInfo = ref(false);
const layout = ref<"grid" | "list">("grid");
const recent = computed(() => {
  const newest = [...store.instances].sort((a, b) => b.createdAt - a.createdAt);
  return store.selected
    ? [
        store.selected,
        ...newest.filter((i) => i.id !== store.selected?.id),
      ].slice(0, 5)
    : [];
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
      : [
          {
            key: "fabric",
            title: "Fabric",
            match: (i: Instance) => i.loader === "fabric",
          },
          {
            key: "vanilla",
            title: "Vanilla",
            match: (i: Instance) => i.loader === "vanilla",
          },
        ];
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
function open(instance?: Instance, copy = false) {
  editing.value = instance;
  duplicate.value = copy;
  showDialog.value = true;
}
function play(instance: Instance) {
  store.selectedId = instance.id;
  launchInfo.value = true;
}
function created(item: Instance) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(item.createdAt));
}
let deletionFocus: HTMLElement | null = null;
async function confirmDelete(item: Instance) {
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
  <div class="play-page">
    <div class="play-main">
      <section class="jump-section" aria-labelledby="jump-heading">
        <button
          id="jump-heading"
          class="section-toggle"
          :aria-expanded="jumpOpen"
          aria-controls="jump-instances"
          @click="jumpOpen = !jumpOpen"
        >
          <h1>Jump in</h1>
          <ChevronDown :size="18" :class="{ flipped: jumpOpen }" />
        </button>
        <div v-if="jumpOpen" id="jump-instances" class="jump-grid">
          <article
            v-for="item in recent"
            :key="item.id"
            :class="['jump-row', { selected: store.selected?.id === item.id }]"
          >
            <button
              class="jump-select"
              :aria-label="'Select recent ' + item.name"
              :aria-pressed="store.selected?.id === item.id"
              @click="store.selectedId = item.id"
            >
              <InstanceIcon :loader="item.loader" :seed="item.id" />
              <span class="jump-identity"
                ><h2>{{ item.name }}</h2>
                <span
                  >{{ item.loader === "fabric" ? "Fabric" : "Vanilla" }}
                  {{ item.minecraftVersion }}
                  <span class="meta-dot">·</span> Created
                  {{ created(item) }}</span
                ></span
              >
            </button>
            <button
              class="button primary jump-play"
              :aria-label="'Play ' + item.name"
              @click="play(item)"
            >
              <Play :size="16" /> Play
            </button>
            <button
              class="icon-button"
              :aria-label="'Manage ' + item.name"
              :disabled="store.busy"
              @click="open(item)"
            >
              <SlidersHorizontal :size="16" />
            </button>
          </article>
          <div v-if="!recent.length" class="jump-empty">
            <Layers3 :size="28" />
            <div>
              <h2>Your next adventure starts here</h2>
              <p class="muted">
                Create a Vanilla or Fabric instance to get started.
              </p>
            </div>
          </div>
        </div>
      </section>
      <div v-if="launchInfo" class="launch-message" role="status">
        <div>
          <strong>Game launch is coming next</strong>
          <p>
            Launching is not implemented in this build. Microsoft sign-in,
            verified game downloads and Java setup are the next milestone.
          </p>
        </div>
        <button
          class="icon-button"
          aria-label="Dismiss launch information"
          @click="launchInfo = false"
        >
          <X :size="16" />
        </button>
      </div>
      <section class="library-section" aria-labelledby="instances-heading">
        <h2 id="instances-heading">
          Library <span class="count">{{ store.instances.length }}</span>
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
            :disabled="store.loading || store.busy || !!store.error"
            @click="open()"
          >
            <Plus :size="17" /> Create instance
          </button>
        </div>
        <div class="library-toolbar">
          <label class="toolbar-select"
            ><SlidersHorizontal :size="15" /><select
              v-model="sort"
              aria-label="Sort instances"
            >
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
            </select></label
          >
          <label class="toolbar-select"
            ><Folder :size="15" /><select
              v-model="grouping"
              aria-label="Group instances"
            >
              <option value="loader">Group by loader</option>
              <option value="favorites">Group by favourites</option>
              <option value="none">No grouping</option>
            </select></label
          >
          <div class="filter-tabs" role="group" aria-label="Filter instances">
            <button
              v-for="tab in [
                { id: 'all', label: 'All' },
                { id: 'favorites', label: 'Favourites' },
                { id: 'vanilla', label: 'Vanilla' },
                { id: 'fabric', label: 'Fabric' },
              ]"
              :key="tab.id"
              :class="{ active: filter === tab.id }"
              :aria-pressed="filter === tab.id"
              @click="filter = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
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
        <div v-if="store.loading" class="empty-state" role="status">
          Opening your library…
        </div>
        <div
          v-else-if="store.error && !store.instances.length"
          class="empty-state"
        >
          <div>
            <h3>We couldn’t open your library.</h3>
            <p class="muted">Resolve the storage error, then try again.</p>
          </div>
          <button class="button secondary" @click="store.init">Retry</button>
        </div>
        <div v-else-if="!items.length" class="empty-state">
          <span class="empty-icon"><Layers3 :size="24" /></span>
          <div>
            <h3>
              {{
                store.instances.length
                  ? "No matching adventures."
                  : "Your library starts here"
              }}
            </h3>
            <p class="muted">
              {{
                store.instances.length
                  ? "Try another search or filter."
                  : "Keep different versions, mods and worlds in their own space."
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
                :aria-label="'Select ' + item.name"
                :aria-pressed="store.selected?.id === item.id"
                @click="store.selectedId = item.id"
              >
                <span class="tile-art"
                  ><InstanceIcon :loader="item.loader" :seed="item.id" /></span
                ><span class="instance-title"
                  ><h3>{{ item.name }}</h3>
                  <span class="instance-version"
                    >{{ item.loader === "fabric" ? "Fabric" : "Vanilla" }}
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
                :disabled="store.busy"
                @click="store.favorite(item.id)"
              >
                <Star
                  :size="14"
                  :fill="item.favorite ? 'currentColor' : 'none'"
                />
              </button>
              <div class="card-bottom">
                <button
                  class="icon-button card-play"
                  :aria-label="'Launch ' + item.name"
                  @click="play(item)"
                >
                  <Play :size="14" />
                </button>
                <div class="card-tools">
                  <button
                    class="icon-button"
                    :aria-label="'Edit ' + item.name"
                    :disabled="store.busy"
                    @click="open(item)"
                  >
                    <SlidersHorizontal :size="14" /></button
                  ><button
                    class="icon-button"
                    :aria-label="'Copy settings for ' + item.name"
                    :disabled="store.busy"
                    @click="open(item, true)"
                  >
                    <Copy :size="14" /></button
                  ><button
                    class="icon-button danger"
                    :aria-label="'Delete ' + item.name"
                    :disabled="store.busy"
                    @click="confirmDelete(item)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </section>
    </div>
    <aside class="context-panel" aria-label="Launcher information">
      <section class="setup-panel">
        <div class="context-heading">
          <h2>Getting started</h2>
          <span>{{ store.instances.length ? "1" : "0" }} / 2</span>
        </div>
        <button
          class="setup-item"
          :disabled="!!store.instances.length"
          @click="open()"
        >
          <span :class="['check-ring', { done: store.instances.length }]"
            ><Check v-if="store.instances.length" :size="14" /><Circle
              v-else
              :size="14" /></span
          ><span>{{
            store.instances.length
              ? "Instance created"
              : "Create your first instance"
          }}</span></button
        ><RouterLink to="/roadmap" class="setup-item"
          ><span class="check-ring"><UserRound :size="14" /></span
          ><span
            >Sign in to Minecraft<span class="setup-subtitle"
              >Coming next</span
            ></span
          ></RouterLink
        >
      </section>
      <section class="account-panel">
        <h2>Playing as</h2>
        <RouterLink class="account-identity" to="/roadmap"
          ><span class="account-portrait"><UserRound :size="22" /></span>
          <div>
            <strong>Not signed in</strong><span>Minecraft account</span>
          </div>
          <ChevronDown :size="16"
        /></RouterLink>
      </section>
      <section class="development-panel">
        <h2>Development</h2>
        <div class="development-art"><Layers3 :size="38" /></div>
        <h3>Your launcher. Your way.</h3>
        <p class="muted">
          Vanilla and Fabric instances, organised in one place. Microsoft
          sign-in and game installation are the next milestone.
        </p>
        <RouterLink class="text-link" to="/roadmap"
          >View roadmap <ArrowUpRight :size="14"
        /></RouterLink>
      </section>
      <section class="pane-update">
        <h2>Azuria {{ updates.version }}</h2>
        <p class="muted">
          {{
            updates.update
              ? "A new version is available."
              : "Signed updates, delivered in the app."
          }}
        </p>
        <RouterLink class="text-link" to="/settings"
          >Launcher settings <ArrowUpRight :size="14"
        /></RouterLink>
      </section>
    </aside>
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
    <p v-if="store.error" role="alert" class="inline-error">
      {{ store.error }}
    </p>
    <div class="dialog-actions">
      <button
        ref="deleteCancel"
        class="button secondary"
        :disabled="store.busy"
        @click="closeDelete"
      >
        Keep instance</button
      ><button
        class="button danger-button"
        :disabled="store.busy"
        @click="remove"
      >
        {{ store.busy ? "Removing…" : "Remove instance" }}
      </button>
    </div>
  </dialog>
</template>

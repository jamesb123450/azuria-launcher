<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
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
  Settings,
  Download,
  FolderOpen,
  Share2,
  Files,
} from "@lucide/vue";
import LaunchControl from "../components/LaunchControl.vue";
import ContentIcon from "../components/ContentIcon.vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import VersionPicker from "../components/VersionPicker.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import { desktop } from "../api";
import { instanceApi } from "../instance-api";
import { contentApi } from "../content-api";
import { useRecentPlay } from "../stores/recent-play";
import { versionArt } from "../lib/version-art";
import { useBehaviour } from "../stores/behaviour";
import { useLauncher } from "../stores/launcher";
import type { Instance } from "../types";
import { LOADERS, loaderName } from "../types";
import { useRouter } from "vue-router";
const router = useRouter();
const store = useLauncher();
const behaviour = useBehaviour();
const search = ref("");
const filter = ref("all");
const sort = ref("newest");
const grouping = ref("none");
const collapsed = ref(new Set<string>());
const history = useRecentPlay();
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
const packIds = ref(new Set<string>());
const packIcons = ref<Record<string, string | null>>({});
const packError = ref("");
let disposed = false;
async function loadPacks() {
  packError.value = "";
  try {
    const result = await contentApi.installedPacks();
    if (disposed) return;
    packIds.value = new Set((result?.packs ?? []).map((p) => p.instanceId));
    await Promise.allSettled(
      (result?.packs ?? []).slice(0, 24).map(async (p) => {
        const details = await contentApi.project(
          p.pack.provider,
          p.pack.projectId,
        );
        if (!disposed)
          packIcons.value[p.instanceId] = details.project.iconUrl ?? null;
      }),
    );
  } catch {
    if (!disposed)
      packError.value =
        "Installed modpacks could not be identified. Try again.";
  }
}
const categories = computed(() => [
  { id: "all", label: "Java", count: store.instances.length },
  { id: "bedrock", label: "Bedrock", count: 0, soon: true },
  {
    id: "favorites",
    label: "Pinned",
    count: store.instances.filter((i) => i.favorite).length,
  },
  {
    id: "custom",
    label: "Custom",
    count: store.instances.filter((i) => i.loader !== "vanilla").length,
  },
]);
const contextItem = ref<Instance>();
const contextMenu = ref<HTMLDivElement>();
const contextPosition = ref({ left: "0px", top: "0px" });
let contextTrigger: HTMLElement | null = null;
const copyTarget = ref<Instance>();
const copySource = ref("");
const copyDialog = ref<HTMLDialogElement>();
const actionError = ref("");
function closeContext(restore = false) {
  contextMenu.value?.hidePopover();
  contextItem.value = undefined;
  if (restore) contextTrigger?.focus();
}
async function showContext(event: MouseEvent | KeyboardEvent, item: Instance) {
  if (store.busy || store.loading || !store.libraryReady) return;
  closeContext();
  contextItem.value = item;
  contextTrigger = event.currentTarget as HTMLElement;
  const box = contextTrigger.getBoundingClientRect();
  const pointer =
    event instanceof MouseEvent && (event.clientX !== 0 || event.clientY !== 0);
  const x = pointer ? event.clientX : box.left + 24,
    y = pointer ? event.clientY : box.top + 24;
  await nextTick();
  const menu = contextMenu.value;
  if (!menu) return;
  menu.showPopover();
  contextPosition.value = {
    left: `${Math.max(10, Math.min(x, innerWidth - menu.offsetWidth - 10))}px`,
    top: `${Math.max(10, Math.min(y, innerHeight - menu.offsetHeight - 10))}px`,
  };
  await nextTick();
  menu
    .querySelector<HTMLButtonElement>("button:not(:disabled)")
    ?.focus({ preventScroll: true });
}
function contextKeys(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeContext(true);
    return;
  }
  if (event.key === "Tab") {
    closeContext();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [
    ...(contextMenu.value?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ) ?? []),
  ];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length
  ]?.focus();
}
function outsideContext(event: PointerEvent) {
  if (!(
    event.target instanceof Node && contextMenu.value?.contains(event.target)
  ))
    closeContext();
}
function viewportChanged(event: Event) {
  if (!(
    event.target instanceof Node && contextMenu.value?.contains(event.target)
  ))
    closeContext();
}
async function runContext(action: string) {
  const item = contextItem.value;
  if (!item || store.busy) return;
  closeContext(true);
  actionError.value = "";
  if (!store.instances.some((i) => i.id === item.id)) return;
  if (action === "edit") open(item);
  else if (action === "settings" || action === "export")
    await router.push(
      `/instances/${item.id}?settings=${action === "export" ? "export" : "general"}`,
    );
  else if (action === "duplicate") open(item, true);
  else if (action === "pin") await store.favorite(item.id);
  else if (action === "delete") await confirmDelete(item);
  else if (action === "copy") {
    copyTarget.value = item;
    copySource.value = store.instances.find((i) => i.id !== item.id)?.id ?? "";
    copyDialog.value?.showModal();
    await nextTick();
    copyDialog.value?.querySelector("select")?.focus();
  } else if (action === "folder") {
    try {
      await instanceApi.open(item.id, "root");
    } catch {
      actionError.value = "The profile folder could not be opened. Try again.";
    }
  }
}
function closeCopy() {
  copyDialog.value?.close();
  copyTarget.value = undefined;
  contextTrigger?.focus();
}
function reviewCopy() {
  const source = store.instances.find((i) => i.id === copySource.value),
    target = copyTarget.value;
  if (!source || !target || !store.instances.some((i) => i.id === target.id))
    return;
  closeCopy();
  open({
    ...source,
    id: target.id,
    name: target.name,
    favorite: target.favorite,
    createdAt: target.createdAt,
  });
}
function lastPlayed(item: Instance) {
  const time = history.played[item.id];
  return time
    ? `Played ${new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "Never played";
}
onMounted(() => {
  void loadPacks();
  window.addEventListener("pointerdown", outsideContext);
  window.addEventListener("wheel", viewportChanged, { passive: true });
  window.addEventListener("resize", viewportChanged);
});
onBeforeUnmount(() => {
  disposed = true;
  closeContext();
  closeCopy();
  window.removeEventListener("pointerdown", outsideContext);
  window.removeEventListener("wheel", viewportChanged);
  window.removeEventListener("resize", viewportChanged);
});
watch(
  () => store.instances.map((i) => i.id).join(","),
  () => closeContext(),
);
const items = computed(() =>
  [...store.instances]
    .filter(
      (i) =>
        i.name.toLowerCase().includes(search.value.toLowerCase()) &&
        (filter.value === "all" ||
          (filter.value === "favorites"
            ? i.favorite
            : filter.value === "custom"
              ? i.loader !== "vanilla"
              : filter.value === "modpacks"
                ? packIds.value.has(i.id)
                : i.loader === filter.value)),
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (sort.value === "name"
          ? a.name.localeCompare(b.name)
          : b.createdAt - a.createdAt),
    ),
);
const groups = computed(() => {
  if (grouping.value === "none")
    return [{ key: "all", title: "Ungrouped", items: items.value }];
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
function open(instance?: Instance, copy = false) {
  store.saveError = "";
  editing.value = instance;
  duplicate.value = copy;
  showDialog.value = true;
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
  if (deletionFocus?.isConnected) deletionFocus.focus();
  else
    document
      .querySelector<HTMLButtonElement>(
        ".profile-header-actions .button.primary",
      )
      ?.focus();
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
        <div>
          <span class="profiles-eyebrow">YOUR COLLECTION</span>
          <h2>Profiles</h2>
        </div>
        <div class="profile-header-actions">
          <button class="button secondary" disabled title="Coming soon">
            <Folder :size="16" />New folder <small>Coming soon</small></button
          ><button class="button secondary" disabled title="Coming soon">
            <Download :size="16" />Import <small>Coming soon</small></button
          ><button
            class="button primary"
            :disabled="store.loading || store.busy || !store.libraryReady"
            @click="open()"
          >
            <Plus :size="17" />New profile
          </button>
        </div>
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
          Advertisements
        </button>
      </div>
      <div
        class="profile-categories"
        role="group"
        aria-label="Profile categories"
      >
        <button
          v-for="category in categories"
          :key="category.id"
          :disabled="category.soon"
          :aria-pressed="filter === category.id"
          @click="filter = category.id"
        >
          <strong>{{ category.label }}</strong
          ><span v-if="!category.soon">{{ category.count }}</span
          ><small v-else>Coming soon</small>
        </button>
      </div>
      <p v-if="actionError" class="inline-error" role="alert">
        {{ actionError }}
      </p>
      <p v-if="packError && filter === 'modpacks'" role="alert">
        {{ packError }}
        <button class="text-link" @click="loadPacks">Try again</button>
      </p>
      <section class="library-section" aria-labelledby="instances-heading">
        <h2 id="instances-heading" class="visually-hidden">
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
                : filter === "custom"
                  ? "Custom"
                  : filter === "modpacks"
                    ? "Modpacks"
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
              tabindex="0"
              :aria-label="`Profile ${item.name}`"
              @contextmenu.prevent.stop="showContext($event, item)"
              @keydown.shift.f10.prevent.stop="showContext($event, item)"
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
                ><span v-if="layout === 'list'" class="tile-art"
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
              <span class="profile-icon-badge"
                ><ContentIcon
                  v-if="packIds.has(item.id)"
                  :url="packIcons[item.id] ?? null"
                  :name="item.name" /><InstanceIcon
                  v-else
                  :loader="item.loader"
                  :icon="item.icon"
                  :seed="item.id"
              /></span>
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
                <RouterLink
                  class="profile-settings-button icon-button"
                  :to="`/instances/${item.id}?settings=general`"
                  :aria-label="`Settings for ${item.name}`"
                  ><Settings :size="18"
                /></RouterLink>
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
                  <div class="instance-more">
                    <button
                      class="icon-button"
                      :id="'more-' + item.id"
                      :aria-label="'More actions for ' + item.name"
                      :aria-expanded="contextItem?.id === item.id"
                      aria-haspopup="menu"
                      aria-controls="profile-context-menu"
                      @click.stop="
                        contextItem?.id === item.id
                          ? closeContext(true)
                          : showContext($event, item)
                      "
                    >
                      <MoreHorizontal :size="18" />
                    </button>
                  </div>
                </div>
              </div>
              <p class="profile-last-played">{{ lastPlayed(item) }}</p>
            </article>
          </div>
        </section>
      </section>
    </div>
    <CommunitySidebar v-if="contextOpen" id="launcher-context" ads-only />
  </div>
  <Teleport to="body"
    ><div
      id="profile-context-menu"
      ref="contextMenu"
      popover="manual"
      class="profile-context-menu"
      role="menu"
      :aria-label="
        contextItem ? `Actions for ${contextItem.name}` : 'Profile actions'
      "
      :style="contextPosition"
      @keydown="contextKeys"
    >
      <template v-if="contextItem">
        <header>{{ contextItem.name }}</header>
        <button role="menuitem" @click="runContext('edit')">
          <SlidersHorizontal :size="15" />Edit
        </button>
        <button role="menuitem" @click="runContext('settings')">
          <Settings :size="15" />Settings
        </button>
        <hr />
        <button role="menuitem" @click="runContext('duplicate')">
          <Copy :size="15" />Duplicate
        </button>
        <button
          role="menuitem"
          :disabled="store.instances.length < 2"
          @click="runContext('copy')"
        >
          <Files :size="15" />Copy from profile…
        </button>
        <button role="menuitem" @click="runContext('export')">
          <Download :size="15" />Export…
        </button>
        <button role="menuitem" disabled>
          <Share2 :size="15" />Profile sharing <small>Coming soon</small>
        </button>
        <button
          role="menuitem"
          :disabled="!desktop"
          @click="runContext('folder')"
        >
          <FolderOpen :size="15" />Show in folder
          <small v-if="!desktop">Desktop only</small>
        </button>
        <button role="menuitem" @click="runContext('pin')">
          <Star :size="15" />{{
            contextItem.favorite ? "Unpin from top" : "Pin to top"
          }}
        </button>
        <hr />
        <button role="menuitem" class="danger" @click="runContext('delete')">
          <Trash2 :size="15" />Delete profile…
        </button>
      </template>
    </div></Teleport
  >
  <dialog
    ref="copyDialog"
    class="instance-dialog small-dialog"
    aria-labelledby="copy-title"
    @cancel.prevent="closeCopy"
  >
    <h2 id="copy-title">Copy settings to {{ copyTarget?.name }}</h2>
    <p class="muted">
      Choose a source profile. You can review the copied name, loader, version,
      memory and icon before saving. Worlds, files and launch overrides are not
      copied.
    </p>
    <label
      >Source profile<select v-model="copySource" aria-label="Source profile">
        <option
          v-for="item in store.instances.filter((i) => i.id !== copyTarget?.id)"
          :key="item.id"
          :value="item.id"
        >
          {{ item.name }}
        </option>
      </select></label
    >
    <div class="dialog-actions">
      <button class="button secondary" @click="closeCopy">Cancel</button
      ><button
        class="button primary"
        :disabled="!copySource || store.busy"
        @click="reviewCopy"
      >
        Review settings
      </button>
    </div>
  </dialog>
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

<style scoped src="./profiles.css"></style>

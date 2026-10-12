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
  Box,
  Layers3,
  LayoutGrid,
  List,
  ChevronRight,
  Check,
  Circle,
  ArrowRight,
  UserRound,
  X,
} from "@lucide/vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import { useLauncher } from "../stores/launcher";
import type { Instance } from "../types";
const store = useLauncher();
const search = ref("");
const filter = ref("all");
const sort = ref("newest");
const showDialog = ref(false);
const editing = ref<Instance>();
const duplicate = ref(false);
const deleting = ref<Instance>();
const deleteDialog = ref<HTMLDialogElement>();
const deleteCancel = ref<HTMLButtonElement>();
const launchInfo = ref(false);
const layout = ref<"grid" | "list">("grid");
const selectedId = computed({
  get: () => store.selected?.id ?? "",
  set: (value: string) => {
    store.selectedId = value;
  },
});
let deletionFocus: HTMLElement | null = null;
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
function open(instance?: Instance, copy = false) {
  editing.value = instance;
  duplicate.value = copy;
  showDialog.value = true;
}
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
      <section class="page-heading">
        <div>
          <span class="eyebrow">YOUR AZURIA WORKSPACE</span>
          <h1>Play<span class="heading-dot">.</span></h1>
          <p class="muted">A home for every adventure.</p>
        </div>
        <button
          class="button secondary create-top"
          :disabled="store.loading || store.busy || !!store.error"
          @click="open()"
        >
          <Plus :size="16" /> Create instance
        </button>
      </section>
      <div class="jump-heading">
        <h2>Jump in</h2>
        <span class="muted">Your selected adventure</span>
      </div>
      <section class="world-banner" aria-label="Selected adventure">
        <div class="world-shade" />
        <div class="banner-top">
          <span class="edition-label"><Box :size="14" /> MINECRAFT JAVA</span
          ><span class="banner-label">YOUR NEXT SESSION</span>
        </div>
        <div class="banner-content">
          <h2>{{ store.selected?.name ?? "A new world awaits." }}</h2>
          <p>
            {{
              store.selected
                ? `Minecraft ${store.selected.minecraftVersion} · ${store.selected.loader === "fabric" ? "Fabric" : "Vanilla"} · ${store.selected.memoryMb / 1024} GB allocated`
                : "Start with Vanilla. Make it yours with Fabric."
            }}
          </p>
          <button
            v-if="!store.selected"
            class="banner-create"
            :disabled="store.loading || store.busy || !!store.error"
            @click="open()"
          >
            Create your first instance <ArrowRight :size="16" /></button
          ><span v-else class="installation-tag"
            ><span /> Not installed yet</span
          >
        </div>
        <button
          v-if="store.selected"
          class="spotlight-open"
          :disabled="store.busy"
          aria-label="Manage selected instance"
          @click="open(store.selected)"
        >
          <ArrowUpRight :size="18" />
        </button>
      </section>
      <section class="library-section" aria-labelledby="instances-heading">
        <div class="section-heading">
          <div class="section-title">
            <h2 id="instances-heading">Library</h2>
            <span class="count">{{ store.instances.length }}</span>
          </div>
          <div class="library-controls">
            <label class="search-box"
              ><Search :size="16" /><input
                v-model="search"
                aria-label="Search instances"
                placeholder="Search instances" /><button
                v-if="search"
                class="icon-button"
                @click="search = ''"
                aria-label="Clear search"
              >
                <X :size="13" /></button
            ></label>
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
        </div>
        <div class="library-toolbar">
          <div class="filter-tabs" role="group" aria-label="Filter instances">
            <button
              v-for="tab in [
                { id: 'all', label: 'All instances' },
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
          <label class="sort-control"
            ><select v-model="sort" aria-label="Sort instances">
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
            </select></label
          >
        </div>
        <div v-if="store.loading" class="empty-state" role="status">
          Opening your library…
        </div>
        <div
          v-else-if="store.error && !store.instances.length"
          class="empty-state"
        >
          <h3>We couldn’t open your library.</h3>
          <p class="muted">Resolve the storage error, then try again.</p>
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
            v-if="!store.instances.length"
            class="icon-button empty-add"
            aria-label="Add your first instance"
            @click="open()"
          >
            <Plus :size="20" /></button
          ><button
            v-else
            class="button secondary"
            @click="
              search = '';
              filter = 'all';
            "
          >
            Clear filters
          </button>
        </div>
        <div
          v-else
          :class="['instance-grid', { 'list-layout': layout === 'list' }]"
        >
          <article
            v-for="item in items"
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
                ><InstanceIcon :loader="item.loader" :seed="item.id" /><span
                  class="tile-edition"
                  >JAVA</span
                ></span
              ><span class="instance-title"
                ><h3>{{ item.name }}</h3>
                <span class="instance-version"
                  >{{ item.loader === "fabric" ? "Fabric" : "Vanilla" }}
                  <span>·</span> {{ item.minecraftVersion }}</span
                ></span
              ></button
            ><button
              class="favorite-button icon-button"
              :aria-label="
                (item.favorite ? 'Unfavourite ' : 'Favourite ') + item.name
              "
              :aria-pressed="item.favorite"
              :disabled="store.busy"
              @click="store.favorite(item.id)"
            >
              <Star
                :size="15"
                :fill="item.favorite ? 'currentColor' : 'none'"
              />
            </button>
            <div class="card-bottom">
              <span class="setup-status"><span /> Not installed</span>
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
          <button
            v-if="filter === 'all' && !search"
            class="new-instance-card"
            @click="open()"
          >
            <Plus :size="22" /><span>New instance</span>
          </button>
        </div>
      </section>
    </div>
    <aside class="context-panel" aria-label="Launcher information">
      <section class="account-panel">
        <div class="context-heading"><span>MINECRAFT ACCOUNT</span></div>
        <div class="account-identity">
          <span class="account-portrait"><UserRound :size="22" /></span>
          <div>
            <strong>Welcome to Azuria</strong><span>Not signed in</span>
          </div>
        </div>
        <RouterLink class="button secondary full-width" to="/roadmap"
          >Account setup <ArrowUpRight :size="14"
        /></RouterLink>
      </section>
      <section v-if="store.selected" class="profile-panel">
        <div class="context-heading">
          <span>INSTANCE DETAILS</span><span class="live-dot" />
        </div>
        <div class="profile-identity">
          <InstanceIcon
            :loader="store.selected?.loader"
            :seed="store.selected?.id"
          />
          <div>
            <strong>{{ store.selected?.name ?? "Make it your own" }}</strong
            ><span>{{
              store.selected ? "Selected instance" : "No instance selected"
            }}</span>
          </div>
        </div>
        <div class="profile-specs">
          <div><span>Edition</span><strong>Java</strong></div>
          <div>
            <span>Loader</span
            ><strong>{{
              store.selected
                ? store.selected.loader === "fabric"
                  ? "Fabric"
                  : "Vanilla"
                : "—"
            }}</strong>
          </div>
          <div>
            <span>Memory</span
            ><strong>{{
              store.selected ? store.selected.memoryMb / 1024 + " GB" : "—"
            }}</strong>
          </div>
        </div>
        <button
          v-if="store.selected"
          class="button secondary full-width"
          :disabled="store.busy"
          @click="open(store.selected)"
        >
          <SlidersHorizontal :size="14" /> Instance settings</button
        ><button v-else class="button secondary full-width" @click="open()">
          <Plus :size="14" /> Set up an instance
        </button>
      </section>
      <section v-if="!store.selected" class="setup-panel">
        <div class="context-heading">
          <span>GETTING STARTED</span
          ><span>{{ store.instances.length ? "1" : "0" }} / 2</span>
        </div>
        <div class="setup-item">
          <span :class="['check-ring', { done: store.instances.length }]"
            ><Check v-if="store.instances.length" :size="12" /><Circle
              v-else
              :size="14"
          /></span>
          <div>
            <strong>Create an instance</strong
            ><span>Choose your version and loader</span>
          </div>
        </div>
        <RouterLink to="/roadmap" class="setup-item"
          ><span class="check-ring"><UserRound :size="13" /></span>
          <div>
            <strong>Connect Minecraft</strong
            ><span>Sign-in is coming next</span>
          </div>
          <ChevronRight :size="14"
        /></RouterLink>
      </section>
      <RouterLink class="discovery-panel" to="/roadmap"
        ><span class="discovery-art" aria-hidden="true" />
        <div class="discovery-content">
          <span class="small-label">ON THE HORIZON</span>
          <h3>More ways to play.</h3>
          <p>Modrinth & CurseForge discovery.</p>
          <span class="discovery-link"
            >See what’s coming <ArrowUpRight :size="14"
          /></span></div
      ></RouterLink>
      <div class="workspace-footer">
        <span class="live-dot" /> Local workspace <span>Windows / Java</span>
      </div>
    </aside>
  </div>
  <footer class="launch-dock" aria-label="Game launch controls">
    <div class="dock-selection">
      <InstanceIcon
        :loader="store.selected?.loader"
        :seed="store.selected?.id"
      />
      <div>
        <span class="dock-caption">{{
          store.selected ? "SELECTED INSTANCE" : "NO INSTANCE SELECTED"
        }}</span
        ><select
          v-if="store.selected"
          v-model="selectedId"
          aria-label="Selected instance"
        >
          <option
            v-for="item in store.instances"
            :key="item.id"
            :value="item.id"
          >
            {{ item.name }}
          </option></select
        ><strong v-else>Ready when you are.</strong>
      </div>
    </div>
    <div class="dock-right">
      <div class="dock-status">
        <span class="status-dot" /><span>{{
          store.selected
            ? "Installation coming next"
            : "Create an instance to get started"
        }}</span>
      </div>
      <button
        v-if="store.selected"
        class="button play-button"
        @click="launchInfo = !launchInfo"
      >
        <Play :size="18" fill="currentColor" /> Play
        <span>JAVA EDITION</span></button
      ><button
        v-else
        class="button play-button"
        :disabled="store.loading || store.busy || !!store.error"
        @click="open()"
      >
        <Plus :size="17" /> New instance
      </button>
    </div>
    <div v-if="launchInfo" class="launch-note" role="status">
      <strong>Game launch is coming next</strong>
      <p>
        Launching is not implemented in this build. Microsoft sign-in, verified
        game downloads and Java setup are the next milestone.
      </p>
      <button
        class="icon-button"
        aria-label="Dismiss launch information"
        @click="launchInfo = false"
      >
        <X :size="15" />
      </button>
    </div>
  </footer>
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

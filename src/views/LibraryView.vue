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
  X,
} from "@lucide/vue";
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
  <section class="page-heading">
    <div>
      <span class="eyebrow">A WORLD OF POSSIBILITIES</span>
      <h1>Your library<span class="heading-dot">.</span></h1>
      <p class="muted">A home for every version of your adventure.</p>
    </div>
    <button
      class="button primary"
      :disabled="store.loading || store.busy || !!store.error"
      @click="open()"
    >
      <Plus :size="18" /> Create instance
    </button>
  </section>
  <section class="hero-panel" aria-label="Selected adventure">
    <div class="hero-art" aria-hidden="true">
      <div class="orb" />
      <div class="mountain mountain-back" />
      <div class="mountain mountain-mid" />
      <div class="mountain mountain-front" />
      <div class="art-grid" />
    </div>
    <div class="hero-content">
      <span class="hero-tag"
        ><span class="status-dot" />
        {{
          store.selected
            ? store.selected.loader.toUpperCase() + " INSTANCE"
            : "MAKE ROOM FOR SOMETHING NEW"
        }}</span
      >
      <h2>
        {{ store.selected?.name ?? "Every great world\nstarts somewhere." }}
      </h2>
      <p>
        {{
          store.selected
            ? "Your adventure is ready to take shape. Game installation and launching are coming next."
            : "One launcher. All your adventures. Create your first instance and make it yours."
        }}
      </p>
      <div class="hero-actions">
        <button
          v-if="store.selected"
          class="button play-button"
          @click="launchInfo = !launchInfo"
        >
          <Play :size="19" fill="currentColor" /> Play
          <span class="button-tag">COMING NEXT</span></button
        ><button
          v-else
          class="button play-button"
          :disabled="store.loading || store.busy || !!store.error"
          @click="open()"
        >
          <Plus :size="19" /> Start your adventure</button
        ><RouterLink class="text-link" to="/roadmap"
          >Explore the roadmap <ArrowUpRight :size="16"
        /></RouterLink>
      </div>
      <div v-if="launchInfo" class="launch-note" role="status">
        Launching is not implemented in this build. Microsoft sign-in, verified
        game downloads and Java setup are the next milestone.
      </div>
    </div>
    <span class="hero-art-caption">YOUR NEXT CHAPTER</span>
  </section>
  <section class="library-section" aria-labelledby="instances-heading">
    <div class="section-heading">
      <div>
        <h2 id="instances-heading">
          Your instances <span class="count">{{ store.instances.length }}</span>
        </h2>
        <p class="muted">Different worlds. One place.</p>
      </div>
      <label class="search-box"
        ><Search :size="17" /><input
          v-model="search"
          aria-label="Search instances"
          placeholder="Find an instance…" /><button
          v-if="search"
          class="icon-button"
          @click="search = ''"
          aria-label="Clear search"
        >
          <X :size="14" /></button
      ></label>
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
        >Sort by<select v-model="sort" aria-label="Sort instances">
          <option value="newest">Newest first</option>
          <option value="name">Name</option>
        </select></label
      >
    </div>
    <div v-if="store.loading" class="empty-state" role="status">
      Opening your library…
    </div>
    <div v-else-if="store.error && !store.instances.length" class="empty-state">
      <h3>We couldn’t open your library.</h3>
      <p class="muted">Resolve the storage error above, then try again.</p>
      <button class="button secondary" @click="store.init">Retry</button>
    </div>
    <div v-else-if="!items.length" class="empty-state">
      <span class="empty-icon"><Layers3 :size="28" /></span>
      <h3>
        {{
          store.instances.length
            ? "No matching adventures."
            : "Your next world belongs here."
        }}
      </h3>
      <p class="muted">
        {{
          store.instances.length
            ? "Try another search or filter."
            : "Create an instance for a clean Vanilla world or your next Fabric setup."
        }}
      </p>
      <button
        v-if="!store.instances.length"
        class="button secondary"
        @click="open()"
      >
        <Plus :size="17" /> Create your first instance</button
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
    <div v-else class="instance-grid">
      <article
        v-for="item in items"
        :key="item.id"
        :class="['instance-card', { selected: store.selected?.id === item.id }]"
      >
        <button
          class="instance-art"
          :data-loader="item.loader"
          :aria-label="'Select ' + item.name"
          :aria-pressed="store.selected?.id === item.id"
          @click="store.selectedId = item.id"
        >
          <span class="card-orb" /><span class="card-terrain" /><span
            class="loader-badge"
            ><Box v-if="item.loader === 'vanilla'" :size="13" /><Layers3
              v-else
              :size="13"
            />
            {{ item.loader === "vanilla" ? "Vanilla" : "Fabric" }}</span
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
          <Star :size="17" :fill="item.favorite ? 'currentColor' : 'none'" />
        </button>
        <div class="card-body">
          <h3>{{ item.name }}</h3>
          <p>
            Minecraft {{ item.minecraftVersion }} <span>·</span>
            {{ item.memoryMb / 1024 }} GB
          </p>
          <div class="card-bottom">
            <span class="setup-status">Awaiting installation</span>
            <div class="card-tools">
              <button
                class="icon-button"
                :aria-label="'Edit ' + item.name"
                :disabled="store.busy"
                @click="open(item)"
              >
                <SlidersHorizontal :size="16" /></button
              ><button
                class="icon-button"
                :aria-label="'Copy settings for ' + item.name"
                :disabled="store.busy"
                @click="open(item, true)"
              >
                <Copy :size="16" /></button
              ><button
                class="icon-button danger"
                :aria-label="'Delete ' + item.name"
                :disabled="store.busy"
                @click="confirmDelete(item)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
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

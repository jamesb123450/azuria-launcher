<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Search,
  X,
  SlidersHorizontal,
  Package,
  Puzzle,
  FileCode2,
  Paintbrush,
  Download,
  Heart,
  Clock3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Mountain,
  Orbit,
  Blocks,
  Sparkles,
  RotateCcw,
  FlaskConical,
} from "@lucide/vue";
import VersionPicker from "../components/VersionPicker.vue";
import {
  discoveryProjects,
  filterDiscovery,
  type ContentKind,
} from "../lib/discover";
const tabs = [
  {
    id: "modpacks" as const,
    label: "Modpacks",
    singular: "modpack",
    icon: Package,
  },
  { id: "mods" as const, label: "Mods", singular: "mod", icon: Puzzle },
  {
    id: "datapacks" as const,
    label: "Datapacks",
    singular: "datapack",
    icon: FileCode2,
  },
  {
    id: "resourcepacks" as const,
    label: "Resource packs",
    singular: "resource pack",
    icon: Paintbrush,
  },
];
const kind = ref<ContentKind>("modpacks");
const query = ref("");
const category = ref("");
const source = ref("");
const loader = ref("");
const version = ref("");
const sort = ref("relevance");
const page = ref(1);
const perPage = ref("6");
const selectedTab = computed(() => tabs.find((tab) => tab.id === kind.value)!);
const categories = computed(() => [
  ...new Set(
    discoveryProjects
      .filter((p) => p.kind === kind.value)
      .map((p) => p.category),
  ),
]);
const loaders = computed(() => [
  ...new Set(
    discoveryProjects.filter((p) => p.kind === kind.value).map((p) => p.loader),
  ),
]);
const results = computed(() =>
  filterDiscovery({
    kind: kind.value,
    query: query.value,
    category: category.value,
    source: source.value,
    loader: loader.value,
    version: version.value,
    sort: sort.value,
  }),
);
const pages = computed(() =>
  Math.max(1, Math.ceil(results.value.length / Number(perPage.value))),
);
const visible = computed(() =>
  results.value.slice(
    (page.value - 1) * Number(perPage.value),
    page.value * Number(perPage.value),
  ),
);
const hasFilters = computed(
  () =>
    !!(
      query.value ||
      category.value ||
      source.value ||
      loader.value ||
      version.value
    ),
);
const symbols = {
  landscape: Mountain,
  orbit: Orbit,
  blocks: Blocks,
  spark: Sparkles,
};
const sorts = [
  { value: "relevance", label: "Relevance" },
  { value: "downloads", label: "Most downloaded" },
  { value: "updated", label: "Recently updated" },
  { value: "name", label: "Name: A–Z" },
];
function reset() {
  query.value = "";
  category.value = "";
  source.value = "";
  loader.value = "";
  version.value = "";
}
function changeKind(value: ContentKind) {
  kind.value = value;
  reset();
}
function number(value: number) {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
watch([kind, query, category, source, loader, version, sort, perPage], () => {
  page.value = 1;
});
</script>
<template>
  <div class="discover-page">
    <section class="discover-heading">
      <div>
        <h1>Discover</h1>
        <p class="muted">Browse modpacks, mods and packs for your instances.</p>
      </div>
      <span class="discovery-preview-badge"
        ><FlaskConical :size="14" /> Catalogue preview</span
      >
    </section>
    <div class="discover-tabs" role="group" aria-label="Content type">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :aria-pressed="kind === tab.id"
        :class="{ active: kind === tab.id }"
        @click="changeKind(tab.id)"
      >
        <component :is="tab.icon" :size="17" />{{ tab.label
        }}<span>{{
          discoveryProjects.filter((p) => p.kind === tab.id).length
        }}</span>
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
              :options="sorts"
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
          <span class="discover-result-count" role="status"
            >{{ results.length }} example
            {{
              results.length === 1
                ? selectedTab.singular
                : selectedTab.label.toLowerCase()
            }}</span
          >
        </div>
        <p id="discover-preview-note" class="discover-preview-note">
          <FlaskConical :size="14" /><span
            >Fictional projects, creators and statistics. Search and filters
            work; downloads and installation aren’t available yet.</span
          >
        </p>
        <div
          v-if="visible.length"
          class="discover-project-list"
          aria-describedby="discover-preview-note"
        >
          <article
            v-for="project in visible"
            :key="project.id"
            class="discover-project"
          >
            <div
              :class="['discover-project-art', project.art]"
              aria-hidden="true"
            >
              <span /><component
                :is="symbols[project.art]"
                :size="30"
                :stroke-width="1.5"
              />
            </div>
            <div class="discover-project-body">
              <div class="discover-project-title">
                <h2>{{ project.name }}</h2>
                <span>by {{ project.author }}</span>
              </div>
              <p>{{ project.description }}</p>
              <div class="discover-tags">
                <span>{{ project.category }}</span
                ><span>{{ project.loader }}</span
                ><span>{{ project.version }}</span
                ><span
                  :class="['discover-source-tag', project.source.toLowerCase()]"
                  ><i />{{ project.source }}</span
                >
              </div>
            </div>
            <div class="discover-project-meta">
              <button
                class="discover-install"
                disabled
                :aria-label="'Install ' + project.name + ' — coming soon'"
                title="Installation is not available in this preview"
              >
                <Plus :size="15" />Install
              </button>
              <div class="discover-project-stats">
                <span
                  :aria-label="number(project.downloads) + ' example downloads'"
                  ><Download :size="13" />{{ number(project.downloads) }}</span
                ><span
                  ><Heart :size="13" />{{ number(project.followers) }}</span
                >
              </div>
              <span class="discover-updated"
                ><Clock3 :size="12" />{{ project.days }}
                {{ project.days === 1 ? "day" : "days" }} ago</span
              >
            </div>
          </article>
        </div>
        <div v-else class="discover-empty">
          <Search :size="30" />
          <h2>No examples found</h2>
          <p>Try a different search or clear your filters.</p>
          <button class="button secondary" @click="reset">
            Clear search & filters
          </button>
        </div>
        <footer class="discover-pagination">
          <span
            >{{ results.length ? (page - 1) * Number(perPage) + 1 : 0 }}–{{
              Math.min(page * Number(perPage), results.length)
            }}
            of {{ results.length }} examples</span
          >
          <nav aria-label="Catalogue pages">
            <button
              :disabled="page === 1"
              aria-label="Previous catalogue page"
              @click="page--"
            >
              <ChevronLeft :size="16" /></button
            ><button
              v-for="value in pages"
              :key="value"
              :class="{ active: page === value }"
              :aria-label="'Catalogue page ' + value"
              :aria-current="page === value ? 'page' : undefined"
              @click="page = value"
            >
              {{ value }}</button
            ><button
              :disabled="page === pages"
              aria-label="Next catalogue page"
              @click="page++"
            >
              <ChevronRight :size="16" />
            </button>
          </nav>
        </footer>
      </section>
      <aside class="discover-filters" aria-label="Discovery filters">
        <div class="discover-filter-heading">
          <SlidersHorizontal :size="15" />
          <div>
            <h2>Filters</h2>
            <p>Filter the catalogue.</p>
          </div>
        </div>
        <fieldset>
          <legend>Source</legend>
          <button
            v-for="provider in [
              { value: '', label: 'All sources' },
              { value: 'Modrinth', label: 'Modrinth' },
              { value: 'CurseForge', label: 'CurseForge' },
            ]"
            :key="provider.label"
            :class="[
              'discover-filter-option',
              { selected: source === provider.value },
            ]"
            :aria-pressed="source === provider.value"
            @click="source = provider.value"
          >
            <span :class="['source-dot', provider.value.toLowerCase()]" />{{
              provider.label
            }}
          </button>
        </fieldset>
        <div class="discover-filter-field">
          <span>Game version</span
          ><VersionPicker
            v-model="version"
            label="Discover game version"
            :options="[
              { value: '', label: 'All versions' },
              { value: '1.21.1', label: '1.21.1' },
              { value: '1.20.1', label: '1.20.1' },
            ]"
          />
        </div>
        <div v-if="loaders.length > 1" class="discover-filter-field">
          <span>Loader</span
          ><VersionPicker
            v-model="loader"
            label="Discover loader"
            :options="[
              { value: '', label: 'Any loader' },
              ...loaders.map((value) => ({ value, label: value })),
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
            v-for="item in categories"
            :key="item"
            :class="['discover-filter-option', { selected: category === item }]"
            :aria-pressed="category === item"
            @click="category = item"
          >
            {{ item }}
          </button>
        </fieldset>
        <button class="discover-reset" :disabled="!hasFilters" @click="reset">
          <RotateCcw :size="13" />Reset filters
        </button>
        <p class="discover-sidebar-note">
          Example catalogue only.<br />Live provider search is not connected.
        </p>
      </aside>
    </div>
  </div>
</template>
<style src="./discover.css"></style>

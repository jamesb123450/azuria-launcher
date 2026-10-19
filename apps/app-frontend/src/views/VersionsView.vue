<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Search, Gamepad2, ChevronRight, RefreshCw } from "@lucide/vue";
import LibraryView from "./LibraryView.vue";
import { useQuickPlay } from "../stores/quick-play";
const route = useRoute(),
  router = useRouter(),
  quick = useQuickPlay();
const search = ref(""),
  snapshots = ref(false);
const saved = computed(() => route.query.tab === "setups");
const items = computed(() =>
  quick.versions.filter(
    (v) =>
      (snapshots.value || v.type === "release") &&
      v.id.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
onMounted(() => {
  void quick.load();
});
function tab(setups: boolean) {
  void router.replace({
    path: "/versions",
    query: setups ? { tab: "setups" } : {},
  });
}
function playVersion(version: string) {
  quick.choose(version);
  void router.push("/");
}
</script>
<template>
  <div class="versions-page">
    <div class="versions-heading">
      <h1>Versions</h1>
      <p>Choose what to play.</p>
    </div>
    <div class="versions-tabs" role="group" aria-label="Version pages">
      <button :aria-pressed="!saved" @click="tab(false)">
        Minecraft versions</button
      ><button :aria-pressed="saved" @click="tab(true)">Saved setups</button>
    </div>
    <LibraryView v-if="saved" /><template v-else
      ><div class="versions-toolbar">
        <label class="search-box"
          ><Search :size="18" /><input
            v-model="search"
            placeholder="Search Minecraft versions"
            aria-label="Search Minecraft versions" /></label
        ><label class="version-snapshots"
          ><input v-model="snapshots" type="checkbox" />Include snapshots &amp;
          older builds</label
        >
        <div
          class="quick-loaders"
          role="group"
          aria-label="Versions mod loader"
        >
          <button
            :aria-pressed="quick.loader === 'vanilla'"
            @click="quick.choose(quick.version, 'vanilla')"
          >
            Vanilla</button
          ><button
            :aria-pressed="quick.loader === 'fabric'"
            @click="quick.choose(quick.version, 'fabric')"
          >
            Fabric
          </button>
        </div>
      </div>
      <p class="versions-help">
        Vanilla and Fabric launching are supported. Select a version to use it
        on Home.
      </p>
      <div
        v-if="quick.loading"
        class="version-loading"
        role="status"
        aria-label="Loading Minecraft versions"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="version-skeleton"
          aria-hidden="true"
        />
      </div>
      <div v-else-if="quick.error" class="empty-state" role="alert">
        <Gamepad2 :size="32" />
        <h2>Couldn’t load versions</h2>
        <p>{{ quick.error }}</p>
        <button class="button secondary" @click="quick.load">
          <RefreshCw :size="16" />Try again
        </button>
      </div>
      <div v-else-if="!items.length" class="empty-state">
        <Search :size="32" />
        <h2>No matching versions</h2>
        <p>Try another search or include snapshots and older builds.</p>
        <button
          class="button secondary"
          @click="
            search = '';
            snapshots = true;
          "
        >
          Clear filters
        </button>
      </div>
      <div v-else class="minecraft-version-grid">
        <button
          v-for="v in items"
          :key="v.id"
          :class="[
            'minecraft-version-card',
            { selected: quick.version === v.id },
          ]"
          :aria-label="`Choose Minecraft ${v.id}`"
          @click="playVersion(v.id)"
        >
          <span class="version-art" aria-hidden="true"
            ><Gamepad2 :size="34" /></span
          ><span class="version-card-info"
            ><strong>Minecraft {{ v.id }}</strong
            ><small>{{
              v.type === "release"
                ? "Release"
                : v.type === "snapshot"
                  ? "Snapshot"
                  : "Historical build"
            }}</small></span
          ><ChevronRight :size="16" />
        </button></div
    ></template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Search,
  Gamepad2,
  RefreshCw,
  Play,
  Settings,
  FolderOpen,
} from "@lucide/vue";
import LibraryView from "./LibraryView.vue";
import QuickLaunch from "../components/QuickLaunch.vue";
import { useQuickPlay } from "../stores/quick-play";
import {
  groupVersionSeries,
  versionSeriesId,
  type VersionSeries,
} from "../lib/version-series";
import { versionArt } from "../lib/version-art";
const route = useRoute(),
  router = useRouter(),
  quick = useQuickPlay();
const profileBusy = ref(false),
  profileError = ref("");
async function openProfile() {
  if (profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    const setup = await quick.ensureSetup();
    await router.push(`/instances/${setup.id}`);
  } catch (e) {
    profileError.value = String(e instanceof Error ? e.message : e);
  } finally {
    profileBusy.value = false;
  }
}
const search = ref(""),
  snapshots = ref(false);
const saved = computed(() => route.query.tab === "setups");
const series = computed(() =>
  groupVersionSeries(
    quick.versions.filter((v) => snapshots.value || v.type === "release"),
  ),
);
const items = computed(() =>
  series.value.filter((group) =>
    group.versions.some((v) =>
      v.id.toLowerCase().includes(search.value.toLowerCase()),
    ),
  ),
);
const selected = computed(() => {
  const version = quick.versions.find((v) => v.id === quick.version);
  return groupVersionSeries(quick.versions).find(
    (group) => group.id === (version ? versionSeriesId(version) : ""),
  );
});
const artwork = computed(() => selected.value && versionArt[selected.value.id]);
function art(id: string) {
  return versionArt[id]?.image ?? "/scenery/cherry-grove.webp";
}
function choose(group: VersionSeries) {
  const matches = group.versions.filter((v) =>
    v.id.toLowerCase().includes(search.value.toLowerCase()),
  );
  quick.choose(
    matches.find((v) => v.id === quick.version)?.id ??
      matches[0]?.id ??
      group.versions[0].id,
  );
}
onMounted(() => {
  void quick.load();
});
function tab(setups: boolean) {
  void router.replace({
    path: "/versions",
    query: setups ? { tab: "setups" } : {},
  });
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
    <LibraryView v-if="saved" />
    <template v-else>
      <div class="versions-workspace">
        <section
          class="versions-catalogue"
          aria-label="Minecraft version catalogue"
        >
          <div class="versions-toolbar">
            <label class="search-box"
              ><Search :size="18" /><input
                v-model="search"
                placeholder="Search Minecraft versions"
                aria-label="Search Minecraft versions" /></label
            ><label class="version-snapshots"
              ><input v-model="snapshots" type="checkbox" />Include snapshots
              &amp; older builds</label
            >
          </div>
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
              v-for="group in items"
              :key="group.id"
              :class="[
                'minecraft-version-card',
                { selected: selected?.id === group.id },
              ]"
              :aria-pressed="selected?.id === group.id"
              :aria-label="`Choose Minecraft ${group.versions[0].id}`"
              :disabled="quick.preparing"
              @click="choose(group)"
            >
              <span class="version-art" aria-hidden="true"
                ><img :src="art(group.id)" alt="" loading="lazy" /><span
                  class="version-poster-caption"
                  ><strong>Minecraft</strong
                  ><span>{{
                    versionArt[group.id]?.title ??
                    (group.versions[0].type === "release"
                      ? "Java Edition"
                      : "Preview build")
                  }}</span></span
                ></span
              >
              <span class="version-card-info"
                ><strong>Minecraft {{ group.id }}</strong
                ><small>{{
                  group.versions[0].type === "release"
                    ? `${group.versions.length} ${group.versions.length === 1 ? "release" : "releases"}`
                    : group.versions[0].type === "snapshot"
                      ? "Snapshot"
                      : "Historical build"
                }}</small></span
              ><Play :size="15" aria-hidden="true" />
            </button>
          </div>
          <details class="versions-art-credit">
            <summary>Artwork credits</summary>
            <p>
              Release images from Mojang’s official launcher. Minecraft belongs
              to Mojang/Microsoft.
              <a
                href="https://launchercontent.mojang.com/v2/javaPatchNotes.json"
                target="_blank"
                rel="noopener noreferrer"
                >Image source</a
              >. Other releases use generic Minecraft scenery by
              <a
                href="https://modrinth.com/resourcepack/karbin-panoramas"
                target="_blank"
                rel="noopener noreferrer"
                >Karbin_Drem</a
              >,
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noopener noreferrer"
                >CC BY-SA 4.0</a
              >, cropped with an overlay.
            </p>
          </details>
        </section>
        <aside class="version-context" aria-label="Selected Minecraft version">
          <template v-if="selected">
            <div class="version-context-art">
              <img :src="art(selected.id)" alt="" /><span>{{
                artwork?.title ?? "Minecraft Java Edition"
              }}</span>
            </div>
            <div class="version-context-copy" aria-live="polite">
              <h2>Minecraft {{ selected.id }}</h2>
              <p>
                {{
                  artwork?.description ??
                  (selected.versions[0].type === "release"
                    ? "Choose a release and loader, then start your next world."
                    : "Preview and historical builds can contain bugs. Use a separate world and keep backups.")
                }}
              </p>
              <a
                href="https://www.minecraft.net/en-us/updates"
                target="_blank"
                rel="noopener noreferrer"
                >Minecraft updates ↗</a
              >
            </div>
            <div class="version-context-controls">
              <label class="version-patch"
                >Version<select
                  aria-label="Selected Minecraft release"
                  :value="quick.version"
                  :disabled="quick.preparing"
                  @change="
                    quick.choose(($event.target as HTMLSelectElement).value)
                  "
                >
                  <option
                    v-for="v in selected.versions"
                    :key="v.id"
                    :value="v.id"
                  >
                    {{ v.id }}
                  </option>
                </select></label
              >
              <div class="version-loader-row">
                <span>Loader</span>
                <div
                  class="quick-loaders"
                  role="group"
                  aria-label="Versions mod loader"
                >
                  <button
                    :aria-pressed="quick.loader === 'vanilla'"
                    :disabled="quick.preparing"
                    @click="quick.choose(quick.version, 'vanilla')"
                  >
                    Vanilla</button
                  ><button
                    :aria-pressed="quick.loader === 'fabric'"
                    :disabled="quick.preparing"
                    @click="quick.choose(quick.version, 'fabric')"
                  >
                    Fabric
                  </button>
                </div>
              </div>
              <RouterLink
                class="version-setup-link"
                :to="
                  quick.setup
                    ? `/instances/${quick.setup.id}`
                    : '/versions?tab=setups'
                "
                ><FolderOpen :size="16" />{{
                  quick.setup ? "Open saved setup" : "Saved setups"
                }}</RouterLink
              >
              <p class="version-setup-note">
                Each version and loader keeps its own setup.
              </p>
              <p v-if="profileError" class="inline-error" role="alert">
                {{ profileError }}
              </p>
              <div class="version-launch-row">
                <button
                  class="icon-button"
                  :disabled="profileBusy"
                  @click="openProfile"
                  aria-label="Open instance page"
                >
                  <Settings :size="18" />
                </button>
                <QuickLaunch compact />
              </div>
            </div>
          </template>
          <div v-else class="empty-state">
            <Gamepad2 :size="30" />
            <h2>Choose a version</h2>
            <p>Select a card to see its releases and launch options.</p>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Search,
  Gamepad2,
  RefreshCw,
  Play,
  Settings,
  FolderOpen,
  Plus,
  Layers3,
  ArrowUpRight,
  Box,
  Spool,
} from "@lucide/vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import LibraryView from "./LibraryView.vue";
import LaunchControl from "../components/LaunchControl.vue";
import ContentIcon from "../components/ContentIcon.vue";
import { useLauncher } from "../stores/launcher";
import { contentApi, type InstalledPackEntry } from "../content-api";
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
  quick = useQuickPlay(),
  library = useLauncher();
const profileBusy = ref(false),
  profileError = ref("");
async function openProfile() {
  if (profileBusy.value) return;
  profileBusy.value = true;
  profileError.value = "";
  try {
    const setup = selectedPack.value?.instance ?? (await quick.ensureSetup());
    await router.push(`/instances/${setup.id}`);
  } catch (e) {
    profileError.value = String(e instanceof Error ? e.message : e);
  } finally {
    profileBusy.value = false;
  }
}
const create = ref(false);
const search = ref(""),
  snapshots = ref(false);
const saved = computed(() => route.query.tab === "setups");
const modpacks = computed(() => route.query.tab === "modpacks");
const mode = computed(() =>
  saved.value ? "profiles" : modpacks.value ? "modpacks" : "minecraft",
);
const sort = ref("newest"),
  packs = ref<InstalledPackEntry[]>([]),
  packsLoading = ref(false),
  packsError = ref("");
const packIcons = ref<Record<string, string | null>>({});
const projectIcons = new Map<string, string | null>();
let generation = 0;
async function loadPacks() {
  if (!library.libraryReady || library.loading) return;
  const current = ++generation;
  packsLoading.value = true;
  packsError.value = "";
  try {
    const result = await contentApi.installedPacks();
    if (current !== generation) return;
    packs.value = result.packs;
    packsLoading.value = false;
    // Resolve provider artwork separately: an unavailable provider must not hide installed packs.
    const projects = new Map(
      result.packs.map((entry) => [
        `${entry.pack.provider}:${entry.pack.projectId}`,
        entry,
      ]),
    );
    await Promise.allSettled(
      [...projects].map(async ([key, entry]) => {
        if (!projectIcons.has(key)) {
          try {
            const details = await contentApi.project(
              entry.pack.provider,
              entry.pack.projectId,
            );
            projectIcons.set(key, details.project.iconUrl ?? null);
          } catch {
            return;
          }
        }
        if (current !== generation) return;
        for (const pack of result.packs.filter(
          (p) => `${p.pack.provider}:${p.pack.projectId}` === key,
        ))
          packIcons.value[pack.instanceId] = projectIcons.get(key) ?? null;
      }),
    );
    if (current !== generation) return;
    if (result.unreadable.length)
      packsError.value =
        "Some profiles could not be checked. Refresh to try again; you can still find them in Saved profiles.";
  } catch {
    if (current === generation)
      packsError.value =
        "Could not load installed modpacks. Refresh to try again.";
  } finally {
    if (current === generation) packsLoading.value = false;
  }
}
watch(
  () => [
    mode.value,
    library.libraryReady,
    library.loading,
    library.instances
      .map((i) => `${i.id}:${i.minecraftVersion}:${i.loader}`)
      .join(","),
  ],
  () => {
    profileError.value = "";
    if (modpacks.value) void loadPacks();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
const selectedPackId = ref("");
const installed = computed(() =>
  packs.value.flatMap((entry) => {
    const instance = library.instances.find((i) => i.id === entry.instanceId);
    return instance ? [{ ...entry, instance }] : [];
  }),
);
const packItems = computed(() =>
  installed.value
    .filter((p) =>
      `${p.instance.name} ${p.instance.minecraftVersion}`
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    )
    .sort((a, b) =>
      sort.value === "name"
        ? a.instance.name.localeCompare(b.instance.name)
        : b.instance.createdAt - a.instance.createdAt,
    ),
);
const selectedPack = computed(() =>
  modpacks.value
    ? (installed.value.find((p) => p.instanceId === selectedPackId.value) ??
      installed.value[0])
    : undefined,
);
function choosePack(id: string) {
  selectedPackId.value = id;
  library.selectedId = id;
  profileError.value = "";
}

const series = computed(() =>
  groupVersionSeries(
    quick.versions.filter((v) => snapshots.value || v.type === "release"),
  ),
);
const items = computed(() =>
  series.value
    .filter((group) =>
      group.versions.some((v) =>
        v.id.toLowerCase().includes(search.value.toLowerCase()),
      ),
    )
    .sort((a, b) =>
      sort.value === "name"
        ? a.id.localeCompare(b.id, undefined, { numeric: true })
        : 0,
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
function tab(value: string) {
  void router.replace({
    path: "/versions",
    query:
      value === "profiles"
        ? { tab: "setups" }
        : value === "modpacks"
          ? { tab: "modpacks" }
          : {},
  });
}
</script>
<template>
  <div :class="['versions-page', { 'has-version-context': !saved }]">
    <div class="versions-browser-toolbar">
      <div class="catalogue-searchbar">
        <label class="catalogue-mode"
          ><select
            aria-label="Version library"
            :value="mode"
            @change="tab(($event.target as HTMLSelectElement).value)"
          >
            <option value="minecraft">Minecraft</option>
            <option value="modpacks">Modpacks</option>
            <option value="profiles">Saved profiles</option>
          </select></label
        >
        <label v-if="!saved" class="search-box"
          ><Search :size="17" /><input
            v-model="search"
            :aria-label="
              modpacks
                ? 'Search installed modpacks'
                : 'Search Minecraft versions'
            "
            :placeholder="
              modpacks
                ? 'Search your installed modpacks…'
                : 'Search your Minecraft versions…'
            "
        /></label>
      </div>
      <label v-if="!saved" class="catalogue-sort"
        ><select v-model="sort" aria-label="Sort catalogue">
          <option value="newest">Newest</option>
          <option value="name">Name</option>
        </select></label
      >
      <label v-if="!saved && !modpacks" class="version-snapshots"
        ><input v-model="snapshots" type="checkbox" />Snapshots &amp; older
        builds</label
      >
      <button class="button primary" @click="create = true">
        <Plus :size="16" />New profile
      </button>
    </div>
    <LibraryView v-if="saved" />
    <template v-else>
      <div class="versions-workspace">
        <section
          class="versions-catalogue"
          aria-label="Minecraft version catalogue"
        >
          <template v-if="modpacks">
            <div class="catalogue-section-heading">
              <div>
                <span class="catalogue-eyebrow">YOUR COLLECTION</span>
                <h1>
                  Installed modpacks <small>{{ installed.length }}</small>
                </h1>
              </div>
              <button
                class="icon-button"
                :disabled="packsLoading"
                aria-label="Refresh installed modpacks"
                @click="loadPacks"
              >
                <RefreshCw :size="17" />
              </button>
            </div>
            <p v-if="packsError" class="inline-error" role="alert">
              {{ packsError }}
            </p>
            <div
              v-if="packsLoading || library.loading"
              class="version-loading"
              role="status"
              aria-label="Loading installed modpacks"
            >
              <div
                v-for="i in 6"
                :key="i"
                class="version-skeleton"
                aria-hidden="true"
              />
            </div>
            <div
              v-else-if="!library.libraryReady"
              class="empty-state"
              role="alert"
            >
              <Layers3 :size="32" />
              <h2>Couldn’t open your library</h2>
              <p>{{ library.loadError }}</p>
              <button class="button secondary" @click="library.init">
                Reload saved profiles
              </button>
            </div>
            <div v-else-if="!packItems.length" class="empty-state">
              <Layers3 :size="32" />
              <h2>
                {{
                  installed.length
                    ? "No matching modpacks"
                    : "No installed modpacks"
                }}
              </h2>
              <p>
                {{
                  installed.length
                    ? "Try another name or Minecraft version."
                    : "Install a modpack to keep it here, ready for your next session."
                }}
              </p>
              <RouterLink class="button secondary" to="/discover?kind=modpacks"
                >Discover modpacks <ArrowUpRight :size="15"
              /></RouterLink>
            </div>
            <div v-else class="minecraft-version-grid modpack-grid">
              <button
                v-for="pack in packItems"
                :key="pack.instanceId"
                :class="[
                  'minecraft-version-card',
                  { selected: selectedPack?.instanceId === pack.instanceId },
                ]"
                :aria-pressed="selectedPack?.instanceId === pack.instanceId"
                :aria-label="`Choose modpack ${pack.instance.name}`"
                @click="choosePack(pack.instanceId)"
              >
                <span class="version-art modpack-art" aria-hidden="true"
                  ><img
                    :src="
                      art(
                        versionSeriesId({
                          id: pack.instance.minecraftVersion,
                          type: 'release',
                        }),
                      )
                    "
                    alt=""
                    loading="lazy"
                  /><span class="pack-poster-identity"
                    ><ContentIcon
                      :url="packIcons[pack.instanceId]"
                      :name="pack.instance.name"
                    /><span>INSTALLED MODPACK</span
                    ><strong>{{ pack.instance.name }}</strong></span
                  ></span
                >
                <span class="version-card-info"
                  ><strong>{{ pack.instance.name }}</strong
                  ><small>{{ pack.instance.minecraftVersion }}</small></span
                ><Play :size="15" aria-hidden="true" />
              </button>
            </div>
          </template>
          <div
            v-else-if="quick.loading"
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
        <aside
          class="version-context"
          :aria-label="
            modpacks ? 'Selected modpack' : 'Selected Minecraft version'
          "
        >
          <Transition name="context-reveal" mode="out-in">
            <div
              v-if="selectedPack"
              :key="selectedPack.instanceId"
              class="version-context-inner"
            >
              <div class="version-context-art pack-context-art">
                <img
                  :src="
                    art(
                      versionSeriesId({
                        id: selectedPack.instance.minecraftVersion,
                        type: 'release',
                      }),
                    )
                  "
                  alt=""
                /><span class="context-edition">INSTALLED MODPACK</span
                ><ContentIcon
                  :url="packIcons[selectedPack.instanceId]"
                  :name="selectedPack.instance.name"
                />
              </div>
              <div class="version-context-copy" aria-live="polite">
                <h2>{{ selectedPack.instance.name }}</h2>
                <p>
                  Minecraft {{ selectedPack.instance.minecraftVersion }} ·
                  {{
                    selectedPack.pack.provider === "modrinth"
                      ? "Modrinth"
                      : "CurseForge"
                  }}
                </p>
              </div>
              <div class="version-context-controls">
                <div class="pack-loader">
                  <span>Installed loader</span
                  ><strong>{{ selectedPack.instance.loader }}</strong>
                </div>
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
                    <Settings :size="18" /></button
                  ><LaunchControl
                    :instance="selectedPack.instance"
                    monitor
                    return-home
                  />
                </div>
              </div>
            </div>
            <div
              v-else-if="selected && !modpacks"
              :key="selected.id"
              class="version-context-inner"
            >
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
                  aria-label="Read more about Minecraft updates"
                  >Read more <ArrowUpRight :size="12"
                /></a>
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
                  <span>Loaders</span>
                  <div
                    class="quick-loaders"
                    role="group"
                    aria-label="Versions mod loader"
                  >
                    <button
                      aria-label="Vanilla"
                      title="Vanilla"
                      :aria-pressed="quick.loader === 'vanilla'"
                      :disabled="quick.preparing"
                      @click="quick.choose(quick.version, 'vanilla')"
                    >
                      <Box :size="19" aria-hidden="true" /></button
                    ><button
                      aria-label="Fabric"
                      title="Fabric"
                      :aria-pressed="quick.loader === 'fabric'"
                      :disabled="quick.preparing"
                      @click="quick.choose(quick.version, 'fabric')"
                    >
                      <Spool :size="19" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <RouterLink
                  class="version-setup-link"
                  :aria-label="
                    quick.setup ? 'Open saved setup' : 'Saved setups'
                  "
                  :to="
                    quick.setup
                      ? `/instances/${quick.setup.id}`
                      : '/versions?tab=setups'
                  "
                  ><FolderOpen :size="14" /><span>{{
                    quick.setup?.name ?? "Separate profile"
                  }}</span
                  ><ArrowUpRight :size="12"
                /></RouterLink>
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
                  <QuickLaunch compact monitor return-home />
                </div>
              </div>
            </div>
            <div v-else class="empty-state">
              <Gamepad2 :size="30" />
              <h2>
                {{ modpacks ? "Your next adventure" : "Choose a version" }}
              </h2>
              <p>
                {{
                  modpacks
                    ? "Select an installed modpack to see its launch options."
                    : "Select a card to see its releases and launch options."
                }}
              </p>
            </div>
          </Transition>
        </aside>
      </div>
    </template>
    <InstanceDialog v-if="create" @close="create = false" />
  </div>
</template>
<style scoped src="./versions.css"></style>

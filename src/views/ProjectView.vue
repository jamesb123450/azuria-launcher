<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, Download, ExternalLink, Image, Package } from "@lucide/vue";
import {
  contentApi,
  type ProjectDetails,
  type Provider,
  type Kind,
  type Version,
} from "../content-api";
import { contentImage } from "../lib/content-images";
import { desktop } from "../api";
import { useContent } from "../stores/content";
import ContentIcon from "../components/ContentIcon.vue";
import ContentInstaller from "../components/ContentInstaller.vue";
import ProjectDescription from "../components/ProjectDescription.vue";
const route = useRoute(),
  content = useContent();
const provider = computed(() => route.params.provider as Provider),
  kind = computed(() => route.params.kind as Kind);
const details = ref<ProjectDetails>(),
  versions = ref<Version[]>([]),
  error = ref(""),
  loading = ref(false),
  tab = ref("description");
const installer = ref<InstanceType<typeof ContentInstaller>>();
let request = 0;
async function load() {
  const token = ++request;
  loading.value = true;
  error.value = "";
  details.value = undefined;
  versions.value = [];
  tab.value = "description";
  try {
    if (
      !["modrinth", "curseforge"].includes(provider.value) ||
      !["mods", "modpacks", "datapacks", "resourcepacks"].includes(kind.value)
    )
      throw Error("Project not found.");
    const [p, v] = await Promise.all([
      contentApi.project(provider.value, String(route.params.project)),
      contentApi.catalogueVersions(
        provider.value,
        String(route.params.project),
        kind.value,
      ),
    ]);
    if (token === request) {
      details.value = p;
      versions.value = v;
    }
  } catch (e) {
    if (token === request) error.value = String(e);
  } finally {
    if (token === request) loading.value = false;
  }
}
watch(() => route.fullPath, load, { immediate: true });
const gallery = computed(
  () => details.value?.gallery.filter((g) => contentImage(g.url)) ?? [],
);
const number = (n: number) =>
  Intl.NumberFormat("en-GB", { notation: "compact" }).format(n);
</script>
<template>
  <section class="project-page">
    <RouterLink to="/discover" class="text-link project-back"
      ><ArrowLeft :size="16" />Discover</RouterLink
    >
    <p v-if="loading" role="status" class="muted">Loading project…</p>
    <div v-else-if="error" role="alert">
      <h1>Couldn’t load project</h1>
      <p>{{ error }}</p>
      <button class="button secondary" @click="load">Retry project</button>
    </div>
    <template v-else-if="details"
      ><header class="project-heading">
        <ContentIcon
          :url="details.project.iconUrl"
          :name="details.project.name"
        />
        <div class="project-heading-text">
          <h1>{{ details.project.name }}</h1>
          <p>{{ details.project.description }}</p>
          <div class="project-stats">
            <span
              ><Download :size="14" />{{
                number(details.project.downloads)
              }}
              downloads</span
            ><span v-if="details.followers"
              >{{ number(details.followers) }} followers</span
            ><span>{{
              provider === "modrinth" ? "Modrinth" : "CurseForge"
            }}</span>
          </div>
        </div>
        <button
          class="button primary"
          :disabled="!desktop || content.busy"
          @click="installer?.open(details.project)"
        >
          <Download :size="16" />Install
        </button>
      </header>
      <nav class="instance-tabs project-tabs" aria-label="Project sections">
        <button
          v-for="t in ['description', 'versions', 'gallery']"
          :key="t"
          :aria-pressed="tab === t"
          @click="tab = t"
        >
          {{ t[0]!.toUpperCase() + t.slice(1) }}</button
        ><button
          class="project-provider"
          @click="contentApi.open(details.project.url)"
        >
          <ExternalLink :size="14" />Provider page
        </button>
      </nav>
      <div class="project-panel">
        <template v-if="tab === 'description'"
          ><ProjectDescription
            v-if="details.body"
            :body="details.body"
            :html="details.bodyHtml"
          />
          <p v-else class="muted">This project has no description.</p></template
        >
        <template v-else-if="tab === 'versions'"
          ><h2>Versions</h2>
          <p class="muted">
            Choose a release to install. Instance compatibility is checked
            before review.
          </p>
          <div v-for="v in versions" :key="v.id" class="project-version">
            <Package :size="20" />
            <div>
              <strong>{{ v.name }}</strong>
              <p class="muted">
                {{ v.gameVersions.join(", ") }} · {{ v.loaders.join(", ") }} ·
                {{ v.releaseType }}
              </p>
            </div>
            <button
              class="button secondary"
              :disabled="!desktop || content.busy"
              :aria-label="'Install ' + v.name"
              @click="installer?.open(details.project, v.id)"
            >
              <Download :size="15" />Install
            </button>
          </div>
          <p v-if="!versions.length" class="muted">
            No public versions are available.
          </p></template
        >
        <template v-else
          ><h2>Gallery</h2>
          <div class="project-gallery">
            <figure v-for="g in gallery" :key="g.url">
              <img
                :src="g.url"
                :alt="g.title || details.project.name"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
              <figcaption>
                <strong>{{ g.title }}</strong>
                <p>{{ g.description }}</p>
              </figcaption>
            </figure>
          </div>
          <p v-if="!gallery.length" class="muted">
            <Image :size="20" /> No gallery images have been published.
          </p></template
        >
      </div>
      <ContentInstaller ref="installer" :provider="provider" :kind="kind"
    /></template>
  </section>
</template>
<style scoped>
.project-back {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 24px;
}
.project-heading {
  display: flex;
  gap: 20px;
  align-items: start;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border);
}
.project-heading :deep(.content-icon) {
  width: 88px;
  height: 88px;
  border-radius: 18px;
}
.project-heading-text {
  flex: 1;
  min-width: 0;
}
.project-heading h1 {
  font-size: 28px;
  margin: 0 0 9px;
  overflow-wrap: anywhere;
}
.project-heading p {
  color: var(--muted);
  font-size: 14px;
  margin: 0 0 14px;
  line-height: 1.6;
}
.project-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--muted);
  font-size: 12px;
}
.project-stats span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.project-tabs {
  margin: 22px 0;
}
.project-provider {
  margin-left: auto;
}
.project-panel {
  padding: 28px;
  background: var(--panel, var(--surface));
  border: 1px solid var(--border);
  border-radius: 16px;
}
.project-version {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
}
.project-version > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.project-version p {
  margin: 6px 0 0;
  font-size: 12px;
}
.project-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 20px;
}
.project-gallery figure {
  margin: 0;
}
.project-gallery img {
  width: 100%;
  border-radius: 10px;
}
.project-gallery figcaption {
  font-size: 13px;
  padding-top: 10px;
}
.project-gallery figcaption p {
  color: var(--muted);
  line-height: 1.6;
}
</style>

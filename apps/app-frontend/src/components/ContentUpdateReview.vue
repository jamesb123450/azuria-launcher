<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { ArrowRight, Download, X } from "@lucide/vue";
import {
  contentApi,
  type InstalledProject,
  type Version,
} from "../content-api";
import { useContent } from "../stores/content";
import ContentIcon from "./ContentIcon.vue";
const props = defineProps<{ id: string }>(),
  content = useContent();
const dialog = ref<HTMLDialogElement>(),
  rows = ref<{ item: InstalledProject; next: Version }[]>([]),
  skipped = ref<string[]>([]),
  busy = ref(false),
  error = ref("");
let request = 0,
  trigger: HTMLElement | null = null;
async function open(items: InstalledProject[]) {
  const token = ++request;
  trigger = document.activeElement as HTMLElement;
  rows.value = [];
  skipped.value = [];
  error.value = "";
  busy.value = true;
  await nextTick();
  dialog.value?.showModal();
  try {
    for (const item of items) {
      if (token !== request) return;
      try {
        const versions = await contentApi.versions(
          item.provider,
          item.project.id,
          item.kind,
          props.id,
        );
        const next = versions.find((v) => v.id === item.latest);
        if (token !== request) return;
        if (next) rows.value.push({ item, next });
        else
          skipped.value.push(
            `${item.project.name}: no compatible update is available.`,
          );
      } catch {
        if (token === request)
          skipped.value.push(
            `${item.project.name}: could not check this update. Try again later.`,
          );
      }
    }
  } catch (e) {
    if (token === request) error.value = String(e);
  } finally {
    if (token === request) busy.value = false;
  }
}
function close() {
  request++;
  busy.value = false;
  dialog.value?.close();
  trigger?.focus();
}
function apply() {
  if (busy.value || content.busy || !rows.value.length) return;
  const updates = rows.value.map((r) => ({
    provider: r.item.provider,
    project: r.item.project.id,
    version: r.next.id,
    name: r.item.project.name,
  }));
  close();
  void content.updateBatch(props.id, updates);
}
onBeforeUnmount(close);
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="content-update-review"
    aria-labelledby="update-all-title"
    @cancel.prevent="close"
  >
    <header>
      <div>
        <span class="review-eyebrow">PROFILE CONTENT</span>
        <h2 id="update-all-title">Update all</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close update review"
        @click="close"
      >
        <X :size="19" />
      </button>
    </header>
    <p class="muted">
      {{
        busy
          ? "Finding compatible updates…"
          : `Update ${rows.length} ${rows.length === 1 ? "project" : "projects"} to the versions shown?`
      }}
    </p>
    <p v-if="busy" role="status" class="muted">
      Checking versions for this Minecraft version and loader.
    </p>
    <div class="update-review-list">
      <article
        v-for="row in rows"
        :key="row.item.provider + row.item.project.id"
      >
        <ContentIcon :url="row.item.project.iconUrl" /><strong>{{
          row.item.project.name
        }}</strong
        ><span class="update-before" :title="row.item.versionName">{{
          row.item.versionName
        }}</span
        ><ArrowRight :size="13" /><span
          class="update-after"
          :title="row.next.name"
          >{{ row.next.name }}</span
        >
      </article>
    </div>
    <p v-if="!busy && !rows.length" class="muted">
      No compatible updates to install.
    </p>
    <ul v-if="skipped.length" class="update-skipped">
      <li v-for="message in skipped" :key="message">{{ message }}</li>
    </ul>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <p class="update-review-note">
      Updates install one at a time. If one fails, the rest stop; completed
      updates stay installed. Worlds and local files are kept.
    </p>
    <footer>
      <button class="button secondary" @click="close">Cancel</button
      ><button
        class="button primary"
        :disabled="busy || content.busy || !rows.length"
        @click="apply"
      >
        <Download :size="16" />Update all ({{ rows.length }})
      </button>
    </footer>
  </dialog>
</template>

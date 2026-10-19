<script setup lang="ts">
import {
  computed,
  ref,
  onMounted,
  watch,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { useRoute } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
import { instanceApi } from "../instance-api";
import { useLauncher } from "../stores/launcher";
import VersionPicker from "../components/VersionPicker.vue";
const store = useLauncher();
const route = useRoute();
const selected = ref(String(route.query.instance ?? "all"));
const shots = ref<
  {
    id: string;
    name: string;
    instance: string;
    image?: string;
    error?: string;
  }[]
>([]);
const busy = ref(false);
const error = ref("");
const limit = ref(24);
const view = ref<{ id: string; name: string; image: string } | null>(null);
const dialog = ref<HTMLDialogElement>();
const actionBusy = ref(false);
let generation = 0;
const options = computed(() => [
  { value: "all", label: "All instances" },
  ...store.instances.map((i) => ({ value: i.id, label: i.name })),
]);
const visible = computed(() => shots.value.slice(0, limit.value));
async function load() {
  const ticket = ++generation;
  busy.value = true;
  error.value = "";
  shots.value = [];
  limit.value = 24;
  try {
    const items = store.instances.filter(
      (i) => selected.value === "all" || i.id === selected.value,
    );
    const all = [];
    for (const item of items) {
      const entries = await instanceApi.entries(item.id, "screenshots");
      all.push(
        ...entries.map((e) => ({
          id: item.id,
          name: e.name,
          instance: item.name,
        })),
      );
    }
    if (ticket !== generation) return;
    shots.value = all.sort((a, b) => b.name.localeCompare(a.name));
    await thumbs(ticket);
  } catch (e) {
    if (ticket === generation) error.value = String(e);
  } finally {
    if (ticket === generation) busy.value = false;
  }
}
async function thumbs(ticket = generation) {
  const queue = visible.value.filter((s) => !s.image && !s.error);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < queue.length) {
        const shot = queue[next++]!;
        try {
          const image = await invoke<string>("screenshot_image", {
            id: shot.id,
            name: shot.name,
            thumbnail: true,
          });
          if (ticket === generation) shot.image = image;
        } catch {
          if (ticket === generation) shot.error = "Preview unavailable";
        }
      }
    }),
  );
}
async function open(shot: (typeof shots.value)[number]) {
  error.value = "";
  actionBusy.value = true;
  try {
    const image = await invoke<string>("screenshot_image", {
      id: shot.id,
      name: shot.name,
      thumbnail: false,
    });
    view.value = { ...shot, image };
    await nextTick();
    dialog.value?.showModal();
  } catch (e) {
    error.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}
async function remove() {
  if (!view.value || !window.confirm("Move this screenshot to Azuria’s trash?"))
    return;
  actionBusy.value = true;
  try {
    await instanceApi.remove(view.value.id, "screenshots", view.value.name);
    dialog.value?.close();
    view.value = null;
    await load();
  } catch (e) {
    error.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}
async function openFolder() {
  if (!view.value) return;
  try {
    await instanceApi.open(view.value.id, "screenshots");
  } catch (e) {
    error.value = String(e);
  }
}
async function save() {
  if (!view.value) return;
  actionBusy.value = true;
  try {
    await invoke("screenshot_export", {
      id: view.value.id,
      name: view.value.name,
    });
  } catch (e) {
    error.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}
watch(
  () => [selected.value, store.instances.map((i) => i.id).join(",")],
  () => {
    void load();
  },
);
onMounted(() => {
  void load();
});
onBeforeUnmount(() => generation++);
</script>
<template>
  <section class="page-heading">
    <div>
      <h1>Screenshots</h1>
      <p class="muted">
        Moments from your worlds, kept in their original instance folders.
      </p>
    </div>
    <button class="button secondary" :disabled="busy" @click="load">
      Refresh
    </button>
  </section>
  <VersionPicker
    v-model="selected"
    label="Screenshot instance"
    :options="options"
  />
  <p v-if="!desktop" class="muted">
    Screenshots are available in the installed desktop app.
  </p>
  <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
  <p v-if="busy" class="muted" role="status">Loading screenshots…</p>
  <div v-if="!busy && !shots.length" class="instance-files-empty">
    <h2>No screenshots yet</h2>
    <p class="muted">
      Take a screenshot with F2 in Minecraft. PNG files in your instance’s
      screenshots folder appear here.
    </p>
  </div>
  <div class="screenshot-grid">
    <button
      v-for="shot in visible"
      :key="shot.id + shot.name"
      class="screenshot-card"
      :disabled="actionBusy"
      @click="open(shot)"
    >
      <img
        v-if="shot.image"
        :src="shot.image"
        :alt="shot.name"
        loading="lazy"
      /><span v-else class="screenshot-placeholder">{{
        shot.error ?? "Loading preview…"
      }}</span
      ><strong>{{ shot.name }}</strong
      ><span>{{ shot.instance }}</span>
    </button>
  </div>
  <button
    v-if="shots.length > limit"
    class="button secondary"
    @click="
      limit += 24;
      thumbs();
    "
  >
    Load more
  </button>
  <dialog
    ref="dialog"
    class="screenshot-dialog"
    aria-label="Screenshot preview"
    @close="view = null"
  >
    <template v-if="view"
      ><header>
        <strong>{{ view.name }}</strong
        ><button
          class="icon-button"
          aria-label="Close screenshot"
          @click="dialog?.close()"
        >
          ×
        </button>
      </header>
      <img :src="view.image" :alt="view.name" />
      <footer>
        <button class="button secondary" :disabled="actionBusy" @click="save">
          Export PNG</button
        ><button
          class="button secondary"
          :disabled="actionBusy"
          @click="openFolder"
        >
          Open folder</button
        ><button
          class="button secondary"
          :disabled="actionBusy"
          @click="remove"
        >
          Move to trash
        </button>
      </footer>
      <p v-if="error" class="inline-error" role="alert">
        {{ error }}
      </p></template
    >
  </dialog>
</template>
<style scoped>
.screenshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  margin: 24px 0;
}
.screenshot-card {
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  padding: 0 0 14px;
  overflow: hidden;
  text-align: left;
  background: var(--panel);
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.screenshot-card img,
.screenshot-placeholder {
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: var(--bg);
}
.screenshot-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 12px;
}
.screenshot-card strong {
  font-size: 12px;
  margin: 4px 14px 0;
  overflow-wrap: anywhere;
}
.screenshot-card > span:last-child {
  font-size: 11px;
  color: var(--muted);
  margin: 0 14px;
}
.screenshot-dialog {
  width: min(1050px, calc(100vw - 64px));
  max-height: calc(100dvh - 64px);
  overflow: auto;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  padding: 20px;
}
.screenshot-dialog header,
.screenshot-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.screenshot-dialog header strong {
  font-size: 13px;
  overflow-wrap: anywhere;
}
.screenshot-dialog > img {
  display: block;
  max-width: 100%;
  max-height: 65vh;
  margin: 16px auto;
  object-fit: contain;
}
.screenshot-dialog footer {
  justify-content: flex-end;
}
</style>

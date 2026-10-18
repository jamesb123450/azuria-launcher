<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { FolderOpen, RefreshCw, Trash2, HardDrive } from "@lucide/vue";
import { desktop } from "../api";
import { fileSize, resourceApi, type StorageReport } from "../resource-api";
const props = defineProps<{
  disabled: boolean;
  unsaved: boolean;
  revision: string;
}>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const report = ref<StorageReport>(),
  busy = ref(false),
  cleaning = ref(false),
  error = ref(""),
  notice = ref(""),
  confirming = ref(false);
const categories = computed(() =>
  [...(report.value?.usage.categories ?? [])].sort((a, b) => b.bytes - a.bytes),
);
const palette = [
  "var(--pink)",
  "var(--blue)",
  "#b3a4df",
  "#a9c7b4",
  "#d0b68a",
  "#8ba8b7",
];
async function scan(refresh = false) {
  if (!desktop || busy.value) return;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  confirming.value = false;
  try {
    report.value = await resourceApi.usage(refresh);
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
    emit("busy", false);
  }
}
async function clean() {
  if (!report.value || props.unsaved || props.disabled || busy.value) return;
  const token = report.value.token;
  cleaning.value = true;
  confirming.value = false;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    const bytes = await resourceApi.cleanup(token);
    notice.value = `Removed ${fileSize(bytes)} of abandoned downloads.`;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
    emit("busy", false);
  }
  cleaning.value = false;
  await scan(true);
}
async function open() {
  try {
    await resourceApi.open();
  } catch (e) {
    error.value = String(e);
  }
}
watch(
  () => props.revision,
  () => void scan(true),
);
onMounted(() => void scan());
</script>
<template>
  <section
    class="storage-overview"
    aria-label="Storage usage"
    :aria-busy="busy"
  >
    <header>
      <div>
        <HardDrive :size="17" />
        <h3>Storage usage</h3>
      </div>
      <strong v-if="report" class="storage-total"
        >{{ fileSize(report.usage.totalBytes) }} stored</strong
      >
      <button
        class="icon-button"
        aria-label="Refresh storage usage"
        title="Refresh storage usage"
        :disabled="!desktop || busy || disabled"
        @click="scan(true)"
      >
        <RefreshCw :size="16" />
      </button>
    </header>
    <p v-if="!desktop" class="muted">
      Real disk usage and cleanup are available in the Windows app.
    </p>
    <p v-else-if="busy" role="status" class="muted">
      {{ cleaning ? "Cleaning storage…" : "Measuring storage…" }}
    </p>
    <template v-if="report">
      <p class="storage-caption">
        Unique file bytes in Azuria · hard links counted once
      </p>
      <div
        class="storage-bar"
        role="img"
        :aria-label="
          categories.map((c) => `${c.name}: ${fileSize(c.bytes)}`).join(', ')
        "
      >
        <span
          v-for="(category, index) in categories"
          :key="category.name"
          :title="`${category.name}: ${fileSize(category.bytes)}`"
          :style="{
            width: `${report.usage.totalBytes ? (category.bytes / report.usage.totalBytes) * 100 : 0}%`,
            background: palette[index % palette.length],
          }"
        />
      </div>
      <div class="storage-breakdown" aria-label="Storage categories">
        <span
          v-for="(category, index) in categories"
          :key="category.name"
          class="storage-category"
        >
          <span
            ><i :style="{ background: palette[index % palette.length] }" />{{
              category.name
            }}</span
          ><strong>{{ fileSize(category.bytes) }}</strong>
        </span>
      </div>
      <p v-if="report.usage.skipped" class="muted">
        {{ report.usage.skipped }} linked, unreadable or changing entries were
        skipped. Totals are incomplete; refresh when downloads finish.
      </p>
      <p class="storage-caption">
        File sizes, not filesystem allocation. Compression and cluster sizes can
        affect the space reported by Windows.
      </p>
      <div class="storage-cleanup">
        <div>
          <h3>Abandoned downloads</h3>
          <p>
            Trim staging files older than 24 hours to your saved unused-download
            limit. Worlds, installed content, shared game files, Java and trash
            are kept.
          </p>
        </div>
        <button
          class="button secondary"
          :disabled="busy || disabled || unsaved || !report.usage.cleanupFiles"
          @click="confirming = true"
        >
          <Trash2 :size="15" />Clean up
          {{ fileSize(report.usage.cleanupBytes) }}
        </button>
      </div>
      <p v-if="unsaved" class="muted">
        Save download preferences below, then refresh the cleanup preview.
      </p>
      <div
        v-if="confirming"
        role="group"
        aria-label="Confirm storage cleanup"
        class="storage-confirm"
      >
        <p>
          Remove {{ report.usage.cleanupFiles }} abandoned download files ({{
            fileSize(report.usage.cleanupBytes)
          }})? They can be downloaded again. This action runs immediately.
        </p>
        <div>
          <button class="button secondary" @click="confirming = false">
            Cancel</button
          ><button
            class="button primary"
            :disabled="busy || disabled || unsaved"
            @click="clean"
          >
            Confirm cleanup
          </button>
        </div>
      </div>
    </template>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <button v-if="error && !busy" class="text-link" @click="scan(true)">
      Retry storage scan
    </button>
    <p v-if="notice" role="status" class="muted">{{ notice }}</p>
    <div class="storage-directory">
      <h3>App directory</h3>
      <p>Instances and launcher data stay in Azuria’s AppData folder.</p>
      <code>{{ report?.usage.directory || "%APPDATA%\\AzuriaLauncher" }}</code
      ><button
        class="button secondary"
        :disabled="!desktop || busy || disabled"
        @click="open"
      >
        <FolderOpen :size="16" />Open app directory
      </button>
    </div>
  </section>
</template>
<style scoped>
.storage-overview {
  margin: 20px 0 28px;
}
.storage-overview header,
.storage-overview header > div {
  display: flex;
  align-items: center;
  gap: 9px;
}
.storage-overview header {
  justify-content: space-between;
}
.storage-overview h3 {
  font-size: 14px;
  margin: 0;
  font-weight: 550;
}
.storage-total {
  display: block;
  font-size: 15px;
  margin-left: auto;
  font-weight: 550;
}
.storage-caption {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}
.storage-bar {
  display: flex;
  height: 14px;
  gap: 1px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--input);
  margin: 18px 0;
}
.storage-bar span {
  min-width: 2px;
}
.storage-breakdown {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
}
.storage-category {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 14px;
}
.storage-category > span {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.storage-breakdown i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}
.storage-breakdown strong {
  font-weight: 450;
  white-space: nowrap;
  color: var(--muted);
}
.storage-cleanup,
.storage-directory {
  border-top: 1px solid var(--border-strong);
  padding-top: 20px;
  margin-top: 20px;
}
.storage-cleanup p,
.storage-directory p,
.storage-confirm p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
}
.storage-directory code {
  display: block;
  font-size: 13px;
  overflow-wrap: anywhere;
  margin: 12px 0;
}
.storage-confirm {
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
  background: var(--input);
}
.storage-confirm > div {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>

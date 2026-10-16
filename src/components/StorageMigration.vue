<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { FolderOpen, Check, LoaderCircle } from "@lucide/vue";
import { api, type MigrationStatus } from "../api";
const emit = defineEmits<{ ready: [] }>();
const dialog = ref<HTMLDialogElement>();
const confirmButton = ref<HTMLButtonElement>();
const retryButton = ref<HTMLButtonElement>();
const report = ref<MigrationStatus>();
const busy = ref(true);
const confirming = ref(false);
const openingFolder = ref(false);
const error = ref("");
async function prepare() {
  busy.value = true;
  error.value = "";
  try {
    report.value = await api.prepareStorage();
    if (!report.value.required) emit("ready");
    else {
      await nextTick();
      dialog.value?.showModal();
    }
  } catch (cause) {
    error.value = String(cause instanceof Error ? cause.message : cause);
    dialog.value?.showModal();
  } finally {
    busy.value = false;
    await nextTick();
    (confirmButton.value ?? retryButton.value)?.focus();
  }
}
async function confirm() {
  if (busy.value || confirming.value || !report.value?.required) return;
  confirming.value = true;
  error.value = "";
  try {
    await api.confirmMigration();
    emit("ready");
  } catch (cause) {
    error.value = String(cause instanceof Error ? cause.message : cause);
  } finally {
    confirming.value = false;
  }
}
async function openFolder() {
  openingFolder.value = true;
  error.value = "";
  try {
    await api.openInstancesFolder();
  } catch (cause) {
    error.value = String(cause instanceof Error ? cause.message : cause);
  } finally {
    openingFolder.value = false;
  }
}
onMounted(async () => {
  try {
    if (await api.migrationNeeded()) dialog.value?.showModal();
  } catch {
    /* prepare provides the retryable failure screen. */
  }
  await prepare();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="storage-migration"
    aria-labelledby="migration-title"
    aria-describedby="migration-description"
    @keydown.esc.prevent.stop
    @cancel.prevent
  >
    <div class="migration-symbol" aria-hidden="true">
      <LoaderCircle v-if="busy" class="migration-spinner" :size="28" /><Check
        v-else-if="report"
        :size="28"
      /><FolderOpen v-else :size="28" />
    </div>
    <div aria-live="polite" :aria-busy="busy">
      <h1 id="migration-title">
        {{
          busy
            ? "Migrating data"
            : report
              ? "Your instances have a new home"
              : "Migration needs attention"
        }}
      </h1>
      <p id="migration-description" class="muted">
        {{
          busy
            ? "Preparing your library in the new AzuriaLauncher folder. Your original data is retained while the copy is verified."
            : report
              ? "Your library is ready in AppData. You can open the instances folder, or confirm below to continue to Azuria."
              : "Azuria could not complete the storage migration. Your original data has been retained. Resolve the issue below and retry."
        }}
      </p>
    </div>
    <div v-if="report" class="migration-summary">
      <p>
        <strong>{{ report.migratedInstances }}</strong>
        {{
          report.migratedInstances === 1
            ? "instance migrated"
            : "instances migrated"
        }}
      </p>
      <span class="muted">Instances folder</span
      ><code>{{ report.instancesPath }}</code>
      <template v-if="report.backupPath"
        ><span class="muted">Original data retained at</span
        ><code>{{ report.backupPath }}</code></template
      >
      <p class="muted">
        Instance folders use their names. Windows-incompatible characters are
        replaced and duplicate names receive a numbered suffix.
      </p>
    </div>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <div class="migration-actions">
      <button
        ref="retryButton"
        v-if="!busy && !report"
        class="button primary"
        @click="prepare"
      >
        Retry migration
      </button>
      <button
        v-if="report"
        ref="confirmButton"
        class="button primary"
        :disabled="confirming || openingFolder"
        @click="confirm"
      >
        {{ confirming ? "Confirming…" : "Confirm and continue" }}
      </button>
      <button
        v-if="report"
        class="button secondary"
        :disabled="confirming || openingFolder"
        @click="openFolder"
      >
        <FolderOpen :size="17" />{{
          openingFolder ? "Opening…" : "Open instances folder"
        }}
      </button>
      <p class="muted">
        {{
          busy
            ? "Please wait for migration to finish."
            : "Confirmation is required before continuing."
        }}
      </p>
    </div>
  </dialog>
</template>
<style scoped>
.storage-migration {
  width: min(580px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  overflow: auto;
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  padding: 32px;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow);
}
.storage-migration::backdrop {
  background: var(--bg);
}
.migration-symbol {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  color: var(--pink);
  background: color-mix(in srgb, var(--pink) 8%, transparent);
  margin-bottom: 22px;
}
h1 {
  font:
    600 24px/1.35 Sora,
    sans-serif;
  margin: 0 0 12px;
}
p {
  font-size: 14px;
  line-height: 1.65;
  margin: 0 0 12px;
}
.migration-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  margin: 20px 0;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  font-size: 13px;
}
.migration-summary p {
  margin: 0;
  font-size: 13px;
}
code {
  white-space: normal;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.migration-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.migration-actions p {
  width: 100%;
}
.migration-actions p {
  font-size: 13px;
  margin: 12px 0 0;
}
.migration-spinner {
  animation: migration-spin 1.5s linear infinite;
}
@keyframes migration-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

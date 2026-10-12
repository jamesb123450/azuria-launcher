<script setup lang="ts">
import { Download } from "@lucide/vue";
import { desktop } from "../api";
import { useUpdates } from "../stores/updates";
const updates = useUpdates();
</script>
<template>
  <section class="settings-panel">
    <div class="settings-title">
      <Download :size="22" />
      <div>
        <h2>Launcher updates</h2>
        <p class="muted">Azuria {{ updates.version }}</p>
      </div>
    </div>
    <p v-if="!desktop" class="muted">
      Updates are available in the installed desktop app.
    </p>
    <template v-else>
      <div role="status" aria-live="polite">
        <p v-if="updates.status === 'checking'">Checking for updates…</p>
        <p v-else-if="updates.status === 'current'">
          You’re running the latest published version.
        </p>
        <p v-else-if="updates.status === 'downloading'">
          Downloading and verifying update…
          {{ updates.progress === undefined ? "" : updates.progress + "%" }}
        </p>
        <p v-else-if="updates.status === 'installing'">
          Installing update. Azuria will close and restart.
        </p>
        <p v-else-if="updates.update">
          Version {{ updates.update.version }} is available.
        </p>
        <p v-else-if="updates.status === 'idle'" class="muted">
          Check for the latest version of Azuria.
        </p>
      </div>
      <p v-if="updates.error" role="alert" class="muted">{{ updates.error }}</p>
      <progress
        v-if="updates.status === 'downloading'"
        :value="updates.progress"
        max="100"
        aria-label="Update download progress"
      />
      <pre v-if="updates.update?.body" class="update-notes">{{
        updates.update.body
      }}</pre>
      <div class="update-actions">
        <button
          class="button secondary"
          :disabled="updates.busy"
          @click="updates.checkNow"
        >
          Check for updates
        </button>
        <button
          v-if="updates.update"
          class="button primary"
          :disabled="updates.busy"
          @click="updates.install"
        >
          Update & restart
        </button>
      </div>
      <p class="muted update-hint">
        Azuria checks when it opens. Updates are installed only when you choose
        Update & restart.
      </p>
    </template>
  </section>
</template>

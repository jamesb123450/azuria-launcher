<script setup lang="ts">
import { computed, useId } from "vue";
import {
  ArrowUpRight,
  Check,
  Download,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  Clock3,
} from "@lucide/vue";
import { desktop } from "../api";
import { useUpdates } from "../stores/updates";
defineProps<{ compact?: boolean }>();
const updates = useUpdates();
const titleId = useId();
const title = computed(
  () =>
    ({
      idle: "Automatic updates",
      checking: "Finding the latest Azuria",
      current: "You’re up to date",
      downloading: "A little upgrade is on its way",
      verifying: "Checking your download",
      ready: "Ready for a fresh start",
      installing: "Installing your update",
      error: "We couldn’t finish this update",
    })[updates.status],
);
const bytes = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
</script>
<template>
  <section
    :class="['settings-panel', 'update-card', { compact }]"
    :aria-labelledby="titleId"
  >
    <div class="update-card-heading">
      <div class="update-emblem">
        <Check v-if="updates.status === 'current'" :size="24" /><ShieldCheck
          v-else-if="
            updates.status === 'verifying' || updates.status === 'ready'
          "
          :size="24"
        /><Download v-else :size="24" />
      </div>
      <div>
        <span class="update-eyebrow">AZURIA · LAUNCHER UPDATES</span>
        <h2 :id="titleId">
          {{ desktop ? title : "Always moving forward" }}
        </h2>
        <div class="update-version">
          <span>{{ updates.version }}</span
          ><template v-if="updates.update"
            ><ArrowRight :size="12" /><strong>{{
              updates.update.version
            }}</strong></template
          >
        </div>
      </div>
      <span class="update-auto"><Clock3 :size="12" />Automatic</span>
    </div>
    <p v-if="!desktop" class="muted">
      Updates are available in the installed desktop app.
    </p>
    <template v-else
      ><p class="update-description" role="status">
        {{
          updates.status === "checking"
            ? "Checking the release feed. You can keep using Azuria."
            : updates.status === "current"
              ? "You have the latest published release. We’ll check again next time you open Azuria."
              : updates.status === "downloading"
                ? "Downloading the signed update package. Your library stays right where it is."
                : updates.status === "verifying"
                  ? "Azuria verifies the update signature before the installer can run."
                  : updates.status === "ready"
                    ? "Your download is verified. The Windows installer needs to close Azuria and restart it."
                    : updates.status === "installing"
                      ? "Azuria is closing so the Windows installer can finish. It will reopen afterwards."
                      : updates.status === "error"
                        ? "Your current version is still available."
                        : "New releases are checked and downloaded automatically at startup."
        }}
      </p>
      <div
        v-if="
          ['downloading', 'verifying', 'ready', 'installing'].includes(
            updates.status,
          )
        "
        class="update-track"
      >
        <div class="update-track-label">
          <span>{{
            updates.status === "downloading"
              ? "Downloading"
              : updates.status === "verifying"
                ? "Verifying signature"
                : "Download verified"
          }}</span
          ><strong>{{
            updates.progress === undefined ? "" : updates.progress + "%"
          }}</strong>
        </div>
        <progress
          :value="updates.status === 'downloading' ? updates.progress : 100"
          max="100"
          aria-label="Update download progress"
        /><span class="update-byte-count"
          >{{ bytes(updates.received)
          }}<template v-if="updates.total">
            of {{ bytes(updates.total) }}</template
          ></span
        >
        <div class="update-stages">
          <span :class="{ done: updates.status !== 'downloading' }"
            ><Download :size="13" />Download</span
          ><span
            :class="{ done: ['ready', 'installing'].includes(updates.status) }"
            ><ShieldCheck :size="13" />Verify</span
          ><span :class="{ done: updates.status === 'installing' }"
            ><RefreshCw :size="13" />Restart & install</span
          >
        </div>
      </div>
      <p v-if="updates.error" role="alert" class="inline-error">
        {{ updates.error }}
      </p>
      <details v-if="updates.update?.body" class="update-changelog">
        <summary>What’s new in {{ updates.update.version }}</summary>
        <pre>{{ updates.update.body }}</pre>
      </details>
      <div class="update-actions">
        <button
          v-if="updates.status === 'error'"
          class="button secondary"
          @click="updates.checkNow"
        >
          <RefreshCw :size="15" />Retry update</button
        ><button
          v-if="updates.status === 'ready'"
          class="button primary"
          @click="updates.install"
        >
          Restart & install<ArrowUpRight :size="15" />
        </button></div
    ></template>
  </section>
</template>
<style scoped>
.update-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--pink) 5%, var(--panel)),
    var(--panel) 65%
  );
  border: 1px solid var(--border-strong);
}
.update-card-heading {
  display: flex;
  align-items: center;
  gap: 16px;
}
.update-emblem {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: none;
  background: color-mix(in srgb, var(--pink) 12%, transparent);
  color: var(--pink);
  border: 1px solid color-mix(in srgb, var(--pink) 25%, transparent);
  border-radius: 15px;
}
.update-eyebrow {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--muted);
}
.update-card h2 {
  font-size: 20px;
  margin: 6px 0 10px;
  letter-spacing: -0.4px;
}
.update-version {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.update-version strong {
  color: var(--pink);
  font-weight: 500;
}
.update-auto {
  margin-left: auto;
  align-self: start;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--muted);
  padding: 6px 9px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
}
.update-description {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.7;
  margin: 22px 0;
}
.update-track {
  padding: 18px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.update-track-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 12px;
}
.update-track progress {
  display: block;
  width: 100%;
  height: 6px;
  accent-color: var(--pink);
  border: 0;
  border-radius: 10px;
  overflow: hidden;
}
.update-track progress::-webkit-progress-bar {
  background: var(--panel-soft);
}
.update-track progress::-webkit-progress-value {
  background: var(--pink);
  border-radius: 10px;
}
.update-byte-count {
  display: block;
  font-size: 10px;
  color: var(--muted);
  margin: 10px 0 18px;
}
.update-stages {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 10px;
}
.update-stages span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.update-stages .done {
  color: var(--pink);
}
.update-changelog {
  border-top: 1px solid var(--border-strong);
  margin-top: 20px;
  padding-top: 16px;
  font-size: 12px;
}
.update-changelog summary {
  cursor: pointer;
  color: var(--text);
}
.update-changelog pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 200px;
  overflow: auto;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  margin-top: 16px;
}
.update-card .update-actions {
  margin-bottom: 0;
}
.compact {
  margin: 0;
  border: 0;
  padding: 26px;
}
.compact .update-auto {
  display: none;
}
</style>

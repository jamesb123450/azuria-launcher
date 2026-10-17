<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from "vue";
import {
  ArrowDown,
  Check,
  Copy,
  Download,
  Pause,
  Play,
  Search,
  Terminal,
  Trash2,
  WrapText,
} from "@lucide/vue";
import { instanceApi } from "../instance-api";
import { desktop } from "../api";
import { logLines, visibleLog, type LogLevel } from "../utils/log-lines";
import VersionPicker from "./VersionPicker.vue";
const props = defineProps<{ id: string }>();
const names = ref<string[]>([]),
  selected = ref(""),
  text = ref(""),
  error = ref("");
const paused = ref(false),
  follow = ref(true),
  wrap = ref(true),
  loaded = ref(false);
const query = ref(""),
  level = ref("all"),
  cleared = ref(""),
  copied = ref(false);
const output = ref<HTMLElement>();
const levels = [
  { value: "all", label: "All levels" },
  { value: "error", label: "Errors" },
  { value: "warn", label: "Warnings" },
  { value: "info", label: "Info" },
  { value: "debug", label: "Debug" },
];
const lines = computed(() => {
  const value = visibleLog(text.value, cleared.value);
  return value ? logLines(value) : [];
});
const filtered = computed(() =>
  lines.value.filter(
    (line) =>
      (level.value === "all" || line.level === level.value) &&
      line.message.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
const counts = computed(() =>
  lines.value.reduce(
    (result, line) => {
      result[line.level]++;
      return result;
    },
    { info: 0, warn: 0, error: 0, debug: 0 } as Record<LogLevel, number>,
  ),
);
const displayed = computed(() =>
  filtered.value.map((line) => line.message).join("\n"),
);
let generation = 0,
  pending = false,
  disposed = false;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
async function bottom() {
  await nextTick();
  if (output.value) output.value.scrollTop = output.value.scrollHeight;
}
function scroll() {
  const el = output.value;
  if (el) follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
}
function toggleFollow() {
  follow.value = !follow.value;
  if (follow.value) void bottom();
}
async function poll() {
  if (
    pending ||
    paused.value ||
    disposed ||
    !desktop ||
    document.visibilityState === "hidden"
  )
    return;
  pending = true;
  const token = generation,
    id = props.id;
  try {
    const files = await instanceApi.entries(id, "logs");
    if (token !== generation) return;
    names.value = files.map((file) => file.name);
    if (!names.value.includes(selected.value)) {
      selected.value = names.value.includes("latest.log")
        ? "latest.log"
        : names.value.includes("azuria-launch.log")
          ? "azuria-launch.log"
          : (names.value[0] ?? "");
    }
    const name = selected.value;
    if (name) {
      const tail = await instanceApi.log(id, name);
      if (token !== generation || name !== selected.value || paused.value)
        return;
      text.value = tail;
    } else text.value = "";
    error.value = "";
    loaded.value = true;
  } catch (e) {
    if (token === generation) error.value = String(e);
  } finally {
    pending = false;
  }
}
watch(
  () => props.id,
  () => {
    generation++;
    selected.value = "";
    text.value = "";
    cleared.value = "";
    loaded.value = false;
    error.value = "";
    follow.value = true;
    void poll();
  },
  { immediate: true },
);
watch(selected, () => {
  text.value = "";
  cleared.value = "";
  follow.value = true;
  void poll();
});
watch(paused, (value) => {
  if (!value) void poll();
});
watch(displayed, () => {
  if (follow.value) void bottom();
});
async function copy() {
  try {
    await navigator.clipboard.writeText(displayed.value);
    copied.value = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = false), 1600);
  } catch {
    error.value = "Could not copy logs. Select the text and copy it manually.";
  }
}
function download() {
  const url = URL.createObjectURL(
    new Blob([displayed.value], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = selected.value || "azuria.log";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearView() {
  cleared.value = text.value;
}
const timer = setInterval(() => void poll(), 1000);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  clearInterval(timer);
  clearTimeout(copyTimer);
});
</script>
<template>
  <section class="log-console" aria-label="Instance logs">
    <header class="console-toolbar">
      <div class="file-picker">
        <Terminal :size="16" aria-hidden="true" /><VersionPicker
          v-model="selected"
          label="Log file"
          placeholder="No log files"
          :disabled="!names.length"
          :options="names.map((name) => ({ value: name, label: name }))"
        />
      </div>
      <span class="console-status" :class="{ paused }"
        ><span aria-hidden="true"></span
        >{{ paused ? "Paused" : desktop ? "Live" : "Desktop only" }}</span
      >
      <div class="console-actions">
        <button
          :aria-label="paused ? 'Resume live updates' : 'Pause live updates'"
          :title="paused ? 'Resume live updates' : 'Pause live updates'"
          :aria-pressed="paused"
          @click="paused = !paused"
        >
          <component :is="paused ? Play : Pause" :size="16" />
        </button>
        <button
          aria-label="Wrap lines"
          title="Wrap lines"
          :aria-pressed="wrap"
          @click="wrap = !wrap"
        >
          <WrapText :size="16" />
        </button>
        <button
          aria-label="Auto-scroll"
          title="Auto-scroll"
          :aria-pressed="follow"
          @click="toggleFollow"
        >
          <ArrowDown :size="16" />
        </button>
        <span class="action-divider" aria-hidden="true"></span>
        <button
          :aria-label="copied ? 'Copied' : 'Copy visible logs'"
          :title="copied ? 'Copied' : 'Copy visible logs'"
          :disabled="!displayed"
          @click="copy"
        >
          <component :is="copied ? Check : Copy" :size="16" />
        </button>
        <button
          aria-label="Export visible logs"
          title="Export visible logs"
          :disabled="!displayed"
          @click="download"
        >
          <Download :size="16" />
        </button>
        <button
          aria-label="Clear displayed logs"
          title="Clear displayed logs (keeps files)"
          :disabled="!lines.length"
          @click="clearView"
        >
          <Trash2 :size="16" />
        </button>
      </div>
    </header>
    <div class="console-filters">
      <label class="log-search"
        ><Search :size="15" aria-hidden="true" /><input
          v-model="query"
          type="search"
          aria-label="Search logs"
          placeholder="Search logs…"
      /></label>
      <div class="level-picker">
        <VersionPicker v-model="level" label="Log level" :options="levels" />
      </div>
      <div class="log-counts" aria-label="Log level counts">
        <span class="level-error">{{ counts.error }} errors</span
        ><span class="level-warn">{{ counts.warn }} warnings</span>
      </div>
    </div>
    <p v-if="error" class="console-error" role="alert">{{ error }}</p>
    <div
      ref="output"
      class="console-output"
      :class="{ wrap }"
      tabindex="0"
      aria-label="Live game log output"
      @scroll="scroll"
    >
      <div v-if="!desktop" class="console-empty">
        <Terminal :size="24" />
        <h3>Logs are available in the desktop app</h3>
        <p>Open an instance there to see Minecraft’s live output.</p>
      </div>
      <div v-else-if="!filtered.length" class="console-empty">
        <Terminal :size="24" />
        <h3>
          {{
            query || level !== "all"
              ? "No matching lines"
              : cleared
                ? "Display cleared"
                : loaded && !names.length
                  ? "No game logs yet"
                  : "Waiting for output"
          }}
        </h3>
        <p>
          {{
            query || level !== "all"
              ? "Try a different search or log level."
              : cleared
                ? "New output will appear here. Log files are unchanged."
                : "Minecraft’s latest output appears here when it starts."
          }}
        </p>
      </div>
      <div
        v-for="line in filtered"
        :key="line.number"
        class="console-line"
        :class="'level-' + line.level"
      >
        <span class="line-number" aria-hidden="true">{{ line.number }}</span
        ><span class="line-message">{{ line.message || " " }}</span>
      </div>
    </div>
    <footer class="console-footer">
      <span
        >{{ filtered.length.toLocaleString() }} /
        {{ lines.length.toLocaleString() }} lines<span
          v-if="copied"
          role="status"
        >
          · Copied</span
        ></span
      ><span>Last 64 KB · review logs before sharing</span>
    </footer>
  </section>
</template>
<style scoped>
.log-console {
  margin-top: 20px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  overflow: hidden;
  background: var(--panel);
}
.console-toolbar,
.console-filters {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.file-picker {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 180px;
  color: var(--muted);
}
.file-picker :deep(.version-picker) {
  min-width: 160px;
}
.console-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
}
.console-status > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pink);
}
.console-status.paused > span {
  background: var(--muted);
}
.console-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 3px;
}
.console-actions button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
}
.console-actions button:hover:not(:disabled),
.console-actions button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--pink) 10%, transparent);
  color: var(--pink);
}
.console-actions button:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: -2px;
}
.console-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}
.action-divider {
  height: 18px;
  border-left: 1px solid var(--border);
  margin: 0 5px;
}
.log-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 160px;
  color: var(--muted);
}
.log-search input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 7px 0;
}
.log-search input:focus-visible {
  outline: none;
}
.log-search:focus-within {
  color: var(--pink);
}
.level-picker {
  width: 145px;
}
.log-counts {
  display: flex;
  gap: 12px;
  font-size: 11px;
}
.console-output {
  height: clamp(300px, 49vh, 650px);
  overflow: auto;
  padding: 12px 0;
  background: color-mix(in srgb, var(--panel) 88%, #000);
  font:
    12px/1.75 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  scrollbar-gutter: stable;
  color: var(--text);
}
.console-output:focus-visible {
  outline: 1px solid var(--pink);
  outline-offset: -1px;
}
.console-line {
  display: flex;
  min-width: max-content;
  padding-right: 16px;
}
.console-line:hover {
  background: color-mix(in srgb, var(--pink) 4%, transparent);
}
.line-number {
  width: 54px;
  padding-right: 14px;
  text-align: right;
  flex-shrink: 0;
  color: var(--muted);
  opacity: 0.55;
  user-select: none;
}
.line-message {
  white-space: pre;
}
.wrap .console-line {
  min-width: 0;
}
.wrap .line-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
}
.level-error {
  color: #f399a6;
}
.level-warn {
  color: #e5c38e;
}
.level-debug {
  color: var(--muted);
}
.console-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  color: var(--muted);
  text-align: center;
  font-family: inherit;
}
.console-empty h3 {
  font-size: 13px;
  font-weight: 500;
  margin: 14px 0 5px;
}
.console-empty p {
  font-size: 12px;
  margin: 0;
}
.console-error {
  padding: 10px 14px;
  color: #f399a6;
  font-size: 12px;
  margin: 0;
}
.console-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 10px;
}
@media (max-width: 760px) {
  .console-toolbar {
    gap: 8px;
  }
  .console-status {
    margin-left: auto;
  }
  .console-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .log-counts {
    display: none;
  }
}
</style>
<style scoped>
:global(html[data-theme="light"]) .level-error,
:global(html[data-theme="light"]) .console-error {
  color: #a02b46;
}
:global(html[data-theme="light"]) .level-warn {
  color: #79530b;
}
:global(html[data-theme="light"]) .console-output {
  background: var(--input);
}
</style>

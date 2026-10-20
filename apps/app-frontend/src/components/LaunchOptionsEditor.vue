<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { FolderOpen, Search, Plus, Trash2 } from "@lucide/vue";
import VersionPicker from "./VersionPicker.vue";
import { desktop } from "../api";
import { instanceApi } from "../instance-api";
import {
  defaultLaunchOptions,
  type LaunchOptions,
  type OverrideFlags,
} from "../lib/launch-options";
import { memoryLimit, memoryError, loadMemory } from "../system-memory";
onMounted(() => void loadMemory());
const props = defineProps<{
  inheritance?: boolean;
  section?: "java" | "window";
  defaults?: LaunchOptions;
  disabled?: boolean;
}>();
const form = defineModel<LaunchOptions>({ required: true });
const flags = defineModel<OverrideFlags>("enabled", {
  default: () => ({
    memoryMb: true,
    javaPath: true,
    javaArguments: true,
    environment: true,
    window: true,
  }),
});
const error = ref("");

const javaBusy = ref(false);
const candidates = ref<string[]>([]);
const active = (key: keyof LaunchOptions) =>
  !props.inheritance || flags.value[key];
const args = computed({
  get: () => form.value.javaArguments.join("\n"),
  set: (value: string) => {
    form.value.javaArguments = value.split("\n").filter((v) => v.trim());
  },
});
const javaMode = computed({
  get: () => (form.value.javaPath === null ? "automatic" : "custom"),
  set: (value: string) => {
    form.value.javaPath = value === "automatic" ? null : "";
  },
});
const javaPath = computed({
  get: () => form.value.javaPath ?? "",
  set: (value: string) => {
    form.value.javaPath = value;
  },
});
function customJava() {
  if (flags.value.javaPath && form.value.javaPath === null)
    form.value.javaPath = "";
}
const envRows = computed(() => Object.entries(form.value.environment));
function setEnv(old: string, key: string, value: string) {
  const entries = Object.entries(form.value.environment).map(([k, v]) =>
    k === old ? [key, value] : [k, v],
  );
  form.value.environment = Object.fromEntries(entries);
}
function addEnv() {
  let key = "VARIABLE";
  let n = 2;
  while (key in form.value.environment) key = `VARIABLE_${n++}`;
  form.value.environment = { ...form.value.environment, [key]: "" };
}
function removeEnv(key: string) {
  const next = { ...form.value.environment };
  delete next[key];
  form.value.environment = next;
}
async function java(action: "browse" | "detect") {
  javaBusy.value = true;
  error.value = "";
  try {
    if (action === "browse") {
      const path = await instanceApi.browseJava();
      if (path) form.value.javaPath = path;
    } else {
      candidates.value = await instanceApi.detectJava();
      if (candidates.value[0]) form.value.javaPath = candidates.value[0];
      else
        error.value =
          "No Java installation was found in JAVA_HOME or PATH. Browse for java.exe or javaw.exe.";
    }
  } catch (e) {
    error.value = String(e);
  } finally {
    javaBusy.value = false;
  }
}
const inherited = computed(() => props.defaults ?? defaultLaunchOptions());
</script>
<template>
  <fieldset class="launch-options" :disabled="disabled">
    <section v-if="section !== 'window'" class="option-section">
      <div class="option-heading">
        <div>
          <h3>Memory allocation</h3>
          <p>Maximum memory available to Minecraft.</p>
        </div>
        <label v-if="inheritance" class="override-toggle"
          ><input
            v-model="flags.memoryMb"
            type="checkbox"
            role="switch"
          />Custom memory allocation</label
        >
      </div>
      <div
        :class="[
          'memory-controls',
          { 'inherited-preview': !active('memoryMb') },
        ]"
        :inert="!active('memoryMb')"
        :aria-disabled="!active('memoryMb')"
      >
        <input
          v-model.number="form.memoryMb"
          type="range"
          min="512"
          :max="memoryLimit"
          :disabled="!memoryLimit || !active('memoryMb')"
          step="256"
          aria-label="Memory allocation slider"
        /><label
          ><input
            v-model.number="form.memoryMb"
            type="number"
            min="512"
            :max="memoryLimit"
            :disabled="!memoryLimit || !active('memoryMb')"
            step="256"
            aria-label="Memory allocation in MB"
          />
          MB</label
        >
      </div>
      <p v-if="!active('memoryMb')" class="inherited-value">
        Using launcher default: {{ inherited.memoryMb }} MB
      </p>
      <p v-if="memoryError" class="inline-error" role="alert">
        {{ memoryError }}
        <button type="button" class="text-link" @click="loadMemory">
          Retry memory detection
        </button>
      </p>
      <p v-else class="muted">
        {{
          desktop ? "Physical memory limit" : "Browser preview memory estimate"
        }}: {{ memoryLimit ? `${memoryLimit} MB` : "Detecting…" }}. Leave room
        for Windows and other apps.
      </p>
    </section>
    <section v-if="section !== 'java'" class="option-section">
      <div class="option-heading">
        <div>
          <h3>Game window</h3>
          <p>Fullscreen and initial window resolution.</p>
        </div>
        <label v-if="inheritance" class="override-toggle"
          ><input v-model="flags.window" type="checkbox" role="switch" />Custom
          window settings</label
        >
      </div>
      <div
        :class="['window-options', { 'inherited-preview': !active('window') }]"
        :inert="!active('window')"
        :aria-disabled="!active('window')"
      >
        <label
          ><input
            v-model="form.window.fullscreen"
            :disabled="!active('window')"
            type="checkbox"
          />Start in fullscreen</label
        >
        <div class="resolution-inputs">
          <label
            >Width<input
              v-model.number="form.window.width"
              :disabled="!active('window')"
              type="number"
              min="320"
              max="16384" /></label
          ><span>×</span
          ><label
            >Height<input
              v-model.number="form.window.height"
              :disabled="!active('window')"
              type="number"
              min="240"
              max="8640"
          /></label>
        </div>
      </div>
      <p v-if="!active('window')" class="inherited-value">
        Using launcher default:
        {{
          inherited.window.fullscreen
            ? "Fullscreen"
            : `${inherited.window.width} × ${inherited.window.height}`
        }}
      </p>
    </section>
    <section v-if="section !== 'window'" class="option-section">
      <div class="option-heading">
        <div>
          <h3>Java installation</h3>
          <p>Choose automatic selection or a specific Java executable.</p>
        </div>
        <label v-if="inheritance" class="override-toggle"
          ><input
            v-model="flags.javaPath"
            @change="customJava"
            type="checkbox"
            role="switch"
          />Custom Java installation</label
        >
      </div>
      <template v-if="active('javaPath')"
        ><VersionPicker
          v-if="!inheritance"
          v-model="javaMode"
          label="Java selection"
          :options="[
            { value: 'automatic', label: 'Automatic selection' },
            { value: 'custom', label: 'Custom Java executable' },
          ]" />
        <div v-if="inheritance || javaMode === 'custom'" class="java-controls">
          <label
            >Java executable<input
              v-model="javaPath"
              type="text"
              placeholder="C:\Program Files\Java\bin\javaw.exe"
          /></label>
          <div class="instance-inline-actions">
            <button
              type="button"
              class="button secondary"
              :disabled="!desktop || javaBusy"
              @click="java('detect')"
            >
              <Search :size="15" />Detect</button
            ><button
              type="button"
              class="button secondary"
              :disabled="!desktop || javaBusy"
              @click="java('browse')"
            >
              <FolderOpen :size="15" />Browse
            </button>
          </div>
          <VersionPicker
            v-if="candidates.length > 1"
            v-model="javaPath"
            label="Detected Java installations"
            :options="candidates.map((path) => ({ value: path, label: path }))"
          /></div
      ></template>
      <p v-else class="inherited-value">
        Using launcher default:
        {{ inherited.javaPath ?? "Automatic selection" }}
      </p>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    </section>
    <section v-if="section !== 'window'" class="option-section">
      <div class="option-heading">
        <div>
          <h3>Java arguments</h3>
          <p>Additional JVM options, one argument per line.</p>
        </div>
        <label v-if="inheritance" class="override-toggle"
          ><input
            v-model="flags.javaArguments"
            type="checkbox"
            role="switch"
          />Custom Java arguments</label
        >
      </div>
      <label v-if="active('javaArguments')" class="instance-field"
        >Arguments<textarea
          v-model="args"
          rows="4"
          spellcheck="false"
          placeholder="-XX:+UseG1GC"
        />
      </label>
      <p v-else class="inherited-value">
        Using launcher default: {{ inherited.javaArguments.length }} additional
        arguments
      </p>
    </section>
    <section v-if="section !== 'window'" class="option-section">
      <div class="option-heading">
        <div>
          <h3>Environment variables</h3>
          <p>Optional name and value pairs for the game process.</p>
        </div>
        <label v-if="inheritance" class="override-toggle"
          ><input
            v-model="flags.environment"
            type="checkbox"
            role="switch"
          />Custom environment variables</label
        >
      </div>
      <template v-if="active('environment')"
        ><div
          v-for="([key, value], index) in envRows"
          :key="index"
          class="environment-row"
        >
          <input
            :value="key"
            :aria-label="'Variable name ' + (index + 1)"
            @change="
              setEnv(key, ($event.target as HTMLInputElement).value, value)
            "
          /><input
            :value="value"
            :aria-label="'Variable value ' + (index + 1)"
            @input="setEnv(key, key, ($event.target as HTMLInputElement).value)"
          /><button
            type="button"
            class="icon-button"
            :aria-label="'Remove variable ' + key"
            @click="removeEnv(key)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <button type="button" class="button secondary" @click="addEnv">
          <Plus :size="15" />Add variable
        </button></template
      >
      <p v-else class="inherited-value">
        Using launcher default:
        {{ Object.keys(inherited.environment).length }} variables
      </p>
    </section>
  </fieldset>
</template>

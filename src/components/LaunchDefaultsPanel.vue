<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import LaunchOptionsEditor from "./LaunchOptionsEditor.vue";
import { instanceApi } from "../instance-api";
import { defaultLaunchOptions, validateOptions } from "../lib/launch-options";
const form = ref(defaultLaunchOptions());
const busy = ref(true);
const loaded = ref(false);
const error = ref("");
const notice = ref("");
const snapshot = ref("");
const dirty = computed(
  () => loaded.value && JSON.stringify(form.value) !== snapshot.value,
);
onBeforeRouteLeave(
  () =>
    !busy.value &&
    (!dirty.value || window.confirm("Discard unsaved launcher defaults?")),
);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
function discard() {
  form.value = JSON.parse(snapshot.value);
  error.value = "";
  notice.value = "";
}

async function load() {
  busy.value = true;
  error.value = "";
  try {
    form.value = await instanceApi.defaults();
    snapshot.value = JSON.stringify(form.value);
    loaded.value = true;
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  error.value = validateOptions(form.value);
  if (error.value) return;
  busy.value = true;
  notice.value = "";
  try {
    await instanceApi.saveDefaults(form.value);
    snapshot.value = JSON.stringify(form.value);
    notice.value = "Launcher defaults saved.";
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section id="launch-defaults" class="settings-panel launch-defaults-panel">
    <div class="settings-title">
      <div>
        <h2>Game defaults</h2>
        <p class="muted">
          Instances inherit these settings unless an override is enabled.
        </p>
      </div>
    </div>
    <p class="instance-notice">
      These preferences apply when launching Vanilla instances. Other mod
      loaders are not yet supported.
    </p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    <button v-if="!loaded && !busy" class="button secondary" @click="load">
      Retry defaults
    </button>
    <form v-if="loaded" @submit.prevent="save">
      <LaunchOptionsEditor v-model="form" :disabled="busy" />
      <div class="instance-save-bar">
        <button class="button primary" :disabled="busy">
          {{ busy ? "Saving…" : "Save game defaults" }}</button
        ><button
          type="button"
          class="button secondary"
          :disabled="busy || !dirty"
          @click="discard"
        >
          Discard changes</button
        ><span v-if="notice" role="status">{{ notice }}</span>
      </div>
    </form>
    <p v-else-if="busy" class="muted" role="status">Loading defaults…</p>
  </section>
</template>

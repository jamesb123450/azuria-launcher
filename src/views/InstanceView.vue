<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from "vue-router";
import {
  ArrowLeft,
  Settings,
  FolderOpen,
  Boxes,
  Globe,
  ScrollText,
  Search,
  RefreshCw,
  Upload,
  Trash2,
  Copy,
  SlidersHorizontal,
  Check,
  Mountain,
  Moon,
  Box,
} from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import { desktop } from "../api";
import { instanceApi, type FileEntry, type Section } from "../instance-api";
import {
  defaultLaunchOptions,
  effectiveOptions,
  overrideFlags,
  selectedOverrides,
  validateOptions,
  type OverrideFlags,
} from "../lib/launch-options";
import { loaderName } from "../types";
import InstanceIcon from "../components/InstanceIcon.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import LaunchOptionsEditor from "../components/LaunchOptionsEditor.vue";
import VersionPicker from "../components/VersionPicker.vue";
import {
  ICON_COLORS,
  makeIcon,
  uploadIcon,
  type IconGlyph,
} from "../lib/instance-icons";
import "./instance.css";
const store = useLauncher();
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const instance = computed(() => store.instances.find((i) => i.id === id.value));
const settings = computed(() => route.name === "instance-settings");
const settingsSection = computed(() =>
  String(route.params.section ?? "general"),
);
const tab = ref<Section>("mods");
const sectionView = ref<"content" | "worlds" | "logs">("content");
const search = ref("");
const entries = ref<FileEntry[]>([]);
const filesBusy = ref(false);
const actionBusy = ref(false);
const error = ref("");
const notice = ref("");
const log = ref("");
const logName = ref("");
const general = ref({ name: "", icon: null as string | null });
const defaults = ref(defaultLaunchOptions());
const options = ref(defaultLaunchOptions());
const flags = ref<OverrideFlags>(overrideFlags({}));
const preferencesReady = ref(false);
const loadingPreferences = ref(false);
const preferencesError = ref("");
const snapshot = ref("");
const editInstallation = ref(false);
const iconInput = ref<HTMLInputElement>();
const color = ref(ICON_COLORS[0]!);
const glyph = ref<IconGlyph>("cube");
const state = () =>
  JSON.stringify({
    general: general.value,
    options: options.value,
    flags: flags.value,
  });
const dirty = computed(
  () => preferencesReady.value && state() !== snapshot.value,
);
let allowLeave = false;
let request = 0;
let preferenceRequest = 0;
async function loadPreferences() {
  if (!instance.value) return;
  const token = ++preferenceRequest;
  loadingPreferences.value = true;
  preferencesReady.value = false;
  preferencesError.value = "";
  try {
    const [d, o] = await Promise.all([
      instanceApi.defaults(),
      instanceApi.overrides(id.value),
    ]);
    if (token !== preferenceRequest) return;
    general.value = {
      name: instance.value.name,
      icon: instance.value.icon ?? null,
    };
    defaults.value = d;
    options.value = effectiveOptions(d, o);
    flags.value = overrideFlags(o);
    snapshot.value = state();
    preferencesReady.value = true;
  } catch (e) {
    if (token === preferenceRequest) preferencesError.value = String(e);
  } finally {
    if (token === preferenceRequest) loadingPreferences.value = false;
  }
}
const section = computed<Section>(() =>
  sectionView.value === "content" ? tab.value : sectionView.value,
);
watch(
  () => instance.value?.id,
  () => {
    allowLeave = false;
    void loadPreferences();
    void refresh();
  },
  { immediate: true },
);
watch(section, () => {
  search.value = "";
  log.value = "";
  logName.value = "";
  void refresh();
});
const visible = computed(() =>
  entries.value.filter((e) =>
    e.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
);
async function refresh() {
  if (!instance.value) return;
  const token = ++request;
  filesBusy.value = true;
  entries.value = [];
  error.value = "";
  try {
    const result = await instanceApi.entries(id.value, section.value);
    if (token === request) entries.value = result;
  } catch (e) {
    if (token === request) error.value = String(e);
  } finally {
    if (token === request) filesBusy.value = false;
  }
}
async function operate(action: () => Promise<unknown>, success = "") {
  if (actionBusy.value) return;
  actionBusy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
    notice.value = success;
    await refresh();
  } catch (e) {
    error.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}
function importContent() {
  return operate(
    () => instanceApi.import(id.value, section.value),
    "Content refreshed.",
  );
}
function toggleContent(name: string) {
  return operate(() => instanceApi.toggle(id.value, section.value, name));
}
async function openFolder(name?: string) {
  error.value = "";
  try {
    await instanceApi.open(id.value, section.value, name);
  } catch (e) {
    error.value = String(e);
  }
}
async function saveGeneral() {
  if (!instance.value) return;
  await operate(async () => {
    const result = await store.save(
      {
        ...instance.value!,
        name: general.value.name,
        icon: general.value.icon,
      },
      id.value,
    );
    if (!result)
      throw Error(store.saveError || "Could not save this instance.");
    store.notice = "";
    const old = JSON.parse(snapshot.value);
    old.general = { ...general.value };
    snapshot.value = JSON.stringify(old);
  }, "Instance details saved.");
}
async function saveOverrides() {
  const selected = selectedOverrides(options.value, flags.value);
  const validation = validateOptions(
    effectiveOptions(defaults.value, selected),
  );
  if (validation) {
    error.value = validation;
    return;
  }
  await operate(async () => {
    await instanceApi.saveOverrides(id.value, selected);
    const old = JSON.parse(snapshot.value);
    old.options = options.value;
    old.flags = flags.value;
    snapshot.value = JSON.stringify(old);
  }, "Overrides saved.");
}
function discard() {
  const saved = JSON.parse(snapshot.value);
  general.value = saved.general;
  options.value = saved.options;
  flags.value = saved.flags;
  error.value = "";
  notice.value = "";
}
async function icon(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = "";
  try {
    general.value.icon = await uploadIcon(file);
  } catch (e) {
    error.value = String(e);
  } finally {
    if (iconInput.value) iconInput.value.value = "";
  }
}
function customIcon() {
  general.value.icon = makeIcon(color.value, glyph.value);
}
const confirmDialog = ref<HTMLDialogElement>();
const cancelButton = ref<HTMLButtonElement>();
const operation = ref<"remove-instance" | "remove-file" | "duplicate">();
const selectedFile = ref("");
const includeFiles = ref(false);
const dialogError = ref("");
let previousFocus: HTMLElement | null = null;
async function ask(
  action: "remove-instance" | "remove-file" | "duplicate",
  file = "",
) {
  previousFocus = document.activeElement as HTMLElement;
  operation.value = action;
  selectedFile.value = file;
  dialogError.value = "";
  includeFiles.value = false;
  confirmDialog.value?.showModal();
  await nextTick();
  cancelButton.value?.focus();
}
function closeConfirm() {
  if (actionBusy.value) return;
  confirmDialog.value?.close();
  operation.value = undefined;
  previousFocus?.focus();
}
async function confirmed() {
  if (actionBusy.value || !instance.value) return;
  actionBusy.value = true;
  dialogError.value = "";
  try {
    if (operation.value === "remove-instance") {
      if (!(await store.remove(id.value)))
        throw Error(store.deleteError || "Could not remove instance.");
      allowLeave = true;
      actionBusy.value = false;
      closeConfirm();
      await router.push("/");
    } else if (operation.value === "duplicate") {
      const copy = await instanceApi.duplicate(
        instance.value,
        includeFiles.value,
      );
      await store.init();
      allowLeave = true;
      actionBusy.value = false;
      closeConfirm();
      await router.push(`/instances/${copy.id}`);
    } else {
      await instanceApi.remove(id.value, section.value, selectedFile.value);
      actionBusy.value = false;
      closeConfirm();
      notice.value = "File moved to Azuria’s trash folder.";
      await refresh();
    }
  } catch (e) {
    dialogError.value = String(e);
  } finally {
    actionBusy.value = false;
  }
}
async function readLog(name: string) {
  await operate(async () => {
    log.value = await instanceApi.log(id.value, name);
    logName.value = name;
  });
}
function leave() {
  if (actionBusy.value) return false;
  if (allowLeave || !dirty.value) return true;
  return window.confirm("Discard unsaved instance settings?");
}
onBeforeRouteLeave(leave);
onBeforeRouteUpdate((to) =>
  String(to.params.id) !== id.value || to.name !== route.name ? leave() : true,
);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => {
  request++;
  preferenceRequest++;
  window.removeEventListener("beforeunload", beforeUnload);
});
const prettySize = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1048576
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1048576).toFixed(1)} MB`;
</script>
<template>
  <section v-if="store.loading" class="instance-loading" role="status">
    Opening instance…
  </section>
  <section v-else-if="store.loadError" class="empty-state">
    <div>
      <h1>Could not load your library</h1>
      <p class="inline-error" role="alert">{{ store.loadError }}</p>
      <button class="button secondary" @click="store.init">
        Retry library
      </button>
    </div>
  </section>
  <section v-else-if="!instance" class="empty-state">
    <div>
      <h1>Instance not found</h1>
      <p class="muted">It may have been removed from your library.</p>
      <RouterLink class="button secondary" to="/">Back to Library</RouterLink>
    </div>
  </section>
  <div v-else class="instance-workspace">
    <RouterLink
      class="instance-back text-link"
      :to="settings ? `/instances/${id}` : '/'"
      ><ArrowLeft :size="16" />{{
        settings ? "Back to instance" : "Library"
      }}</RouterLink
    >
    <header class="instance-page-header">
      <InstanceIcon
        :loader="instance.loader"
        :seed="instance.id"
        :icon="instance.icon"
      />
      <div class="instance-page-identity">
        <h1>
          {{ instance.name
          }}<span v-if="settings" class="muted"> / Settings</span>
        </h1>
        <p>
          {{ loaderName(instance.loader) }} · Minecraft
          {{ instance.minecraftVersion
          }}<template v-if="instance.loaderVersion">
            · {{ instance.loaderVersion }}</template
          >
        </p>
      </div>
      <div class="instance-inline-actions">
        <button
          class="button secondary"
          :disabled="!desktop || actionBusy"
          @click="instanceApi.open(id).catch((e) => (error = String(e)))"
        >
          <FolderOpen :size="16" />Open folder</button
        ><RouterLink
          v-if="!settings"
          class="button secondary"
          :to="`/instances/${id}/settings/general`"
          ><Settings :size="16" />Settings</RouterLink
        ><button
          class="button primary"
          disabled
          aria-describedby="launch-unavailable"
        >
          Launch unavailable
        </button>
      </div>
    </header>
    <p id="launch-unavailable" class="instance-notice">
      Minecraft installation and launching are still in development. You can
      manage this instance’s files and saved settings.
    </p>
    <div v-if="settings" class="instance-settings-layout">
      <nav class="instance-settings-nav" aria-label="Instance settings">
        <RouterLink
          v-for="item in [
            { id: 'general', label: 'General', icon: Settings },
            { id: 'installation', label: 'Installation', icon: Boxes },
            { id: 'overrides', label: 'Overrides', icon: SlidersHorizontal },
          ]"
          :key="item.id"
          :to="`/instances/${id}/settings/${item.id}`"
          ><component :is="item.icon" :size="17" />{{ item.label }}</RouterLink
        ><RouterLink class="defaults-link" to="/settings#launch-defaults"
          >Launcher defaults</RouterLink
        >
      </nav>
      <div class="instance-settings-content">
        <p v-if="preferencesError" class="inline-error" role="alert">
          {{ preferencesError }}
          <button class="button secondary" @click="loadPreferences">
            Retry settings
          </button>
        </p>
        <p v-else-if="loadingPreferences" class="muted" role="status">
          Loading instance settings…
        </p>
        <template v-if="preferencesReady">
          <section v-if="settingsSection === 'general'">
            <h2>General</h2>
            <form @submit.prevent="saveGeneral">
              <fieldset :disabled="actionBusy">
                <div class="general-identity-fields">
                  <label class="instance-field"
                    >Instance name<input
                      v-model="general.name"
                      maxlength="80"
                      required
                  /></label>
                  <div class="instance-icon-editor">
                    <span class="field-label">Icon</span
                    ><InstanceIcon
                      :loader="instance.loader"
                      :seed="instance.id"
                      :icon="general.icon"
                    /><input
                      ref="iconInput"
                      class="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Upload instance icon"
                      @change="icon"
                    />
                    <div class="instance-inline-actions">
                      <button
                        type="button"
                        class="button secondary"
                        @click="iconInput?.click()"
                      >
                        Upload</button
                      ><button
                        type="button"
                        class="button secondary"
                        @click="general.icon = null"
                      >
                        Reset
                      </button>
                    </div>
                    <div class="icon-colors">
                      <button
                        v-for="swatch in ICON_COLORS"
                        :key="swatch"
                        type="button"
                        :style="{ background: swatch }"
                        :aria-label="'Icon colour ' + swatch"
                        :aria-pressed="color === swatch"
                        @click="
                          color = swatch;
                          customIcon();
                        "
                      />
                    </div>
                    <div class="instance-inline-actions">
                      <button
                        v-for="shape in [
                          { id: 'cube', label: 'Cube', icon: Box },
                          { id: 'mountain', label: 'Mountain', icon: Mountain },
                          { id: 'moon', label: 'Moon', icon: Moon },
                        ]"
                        :key="shape.id"
                        type="button"
                        class="icon-button"
                        :aria-label="shape.label + ' icon'"
                        :aria-pressed="glyph === shape.id"
                        @click="
                          glyph = shape.id as IconGlyph;
                          customIcon();
                        "
                      >
                        <component :is="shape.icon" :size="18" />
                      </button>
                    </div>
                  </div>
                </div>
                <p class="muted">
                  Renaming also renames the instance folder. Duplicate names
                  receive a numbered suffix.
                </p>
                <div class="instance-save-bar">
                  <button class="button primary">Save details</button
                  ><button
                    type="button"
                    class="button secondary"
                    :disabled="!dirty"
                    @click="discard"
                  >
                    Discard changes
                  </button>
                </div>
              </fieldset>
            </form>
            <section class="instance-setting-block">
              <h3>Duplicate instance</h3>
              <p class="muted">
                Create a separate instance from these settings, or include all
                local files.
              </p>
              <button
                class="button secondary"
                :disabled="actionBusy || dirty"
                @click="ask('duplicate')"
              >
                <Copy :size="16" />Duplicate instance
              </button>
            </section>
            <section class="instance-setting-block danger-zone">
              <h3>Remove instance</h3>
              <p class="muted">
                Remove it from your library and retain its files in Azuria’s
                trash folder.
              </p>
              <button
                class="button danger-button"
                :disabled="actionBusy"
                @click="ask('remove-instance')"
              >
                <Trash2 :size="16" />Remove instance
              </button>
            </section>
          </section>
          <section v-else-if="settingsSection === 'installation'">
            <h2>Installation</h2>
            <dl class="installation-info">
              <div>
                <dt>Loader</dt>
                <dd>{{ loaderName(instance.loader) }}</dd>
              </div>
              <div>
                <dt>Minecraft version</dt>
                <dd>{{ instance.minecraftVersion }}</dd>
              </div>
              <div>
                <dt>Loader version preference</dt>
                <dd>{{ instance.loaderVersion ?? "Not set" }}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Configuration saved · installer not available</dd>
              </div>
            </dl>
            <button
              class="button secondary"
              :disabled="actionBusy || dirty"
              @click="editInstallation = true"
            >
              Edit configuration
            </button>
            <p class="muted">
              Changing the game or loader version can make existing mods
              incompatible. Existing worlds and content are retained.
            </p>
            <section class="instance-setting-block">
              <h3>Repair instance</h3>
              <p class="muted">
                Repair will verify Minecraft dependencies when installation is
                available. It will preserve worlds and user content.
              </p>
              <button class="button secondary" disabled>
                Repair unavailable
              </button>
            </section>
          </section>
          <section v-else-if="settingsSection === 'overrides'">
            <h2>Overrides</h2>
            <p class="muted">
              Use launcher defaults, or enable a custom setting for this
              instance. Changes take effect once launching is available.
            </p>
            <form @submit.prevent="saveOverrides">
              <LaunchOptionsEditor
                v-model="options"
                v-model:enabled="flags"
                inheritance
                :defaults="defaults"
                :disabled="actionBusy"
              />
              <div class="instance-save-bar">
                <button class="button primary" :disabled="actionBusy">
                  Save overrides</button
                ><button
                  type="button"
                  class="button secondary"
                  :disabled="actionBusy || !dirty"
                  @click="discard"
                >
                  Discard changes
                </button>
              </div>
            </form>
          </section>
          <section v-else>
            <h2>Settings section not found</h2>
            <RouterLink :to="`/instances/${id}/settings/general`"
              >Open General</RouterLink
            >
          </section>
        </template>
      </div>
    </div>
    <template v-else>
      <nav class="instance-tabs" aria-label="Instance sections">
        <button
          v-for="view in [
            { id: 'content', label: 'Content', icon: Boxes },
            { id: 'worlds', label: 'Worlds', icon: Globe },
            { id: 'logs', label: 'Logs', icon: ScrollText },
          ]"
          :key="view.id"
          :aria-pressed="sectionView === view.id"
          @click="sectionView = view.id as 'content' | 'worlds' | 'logs'"
        >
          <component :is="view.icon" :size="17" />{{ view.label }}
        </button>
      </nav>
      <div class="instance-content-toolbar">
        <label class="search-box"
          ><Search :size="17" /><input
            v-model="search"
            :aria-label="
              sectionView === 'content'
                ? 'Search instance content'
                : sectionView === 'worlds'
                  ? 'Search worlds'
                  : 'Search logs'
            "
            :placeholder="`Search ${sectionView}`" /></label
        ><button
          v-if="sectionView === 'content'"
          class="button secondary"
          :disabled="!desktop || actionBusy || filesBusy"
          @click="importContent()"
        >
          <Upload :size="16" />Import file</button
        ><button
          class="button secondary"
          :disabled="!desktop || actionBusy"
          @click="openFolder()"
        >
          <FolderOpen :size="16" />Open
          {{
            sectionView === "worlds"
              ? "worlds"
              : sectionView === "logs"
                ? "logs"
                : "content"
          }}
          folder</button
        ><button
          class="icon-button"
          aria-label="Refresh instance files"
          :disabled="actionBusy || filesBusy"
          @click="refresh"
        >
          <RefreshCw :size="17" />
        </button>
      </div>
      <div
        v-if="sectionView === 'content'"
        class="instance-content-types"
        role="group"
        aria-label="Content type"
      >
        <button
          v-for="category in [
            { id: 'mods', label: 'Mods' },
            { id: 'resourcePacks', label: 'Resource packs' },
            { id: 'shaderPacks', label: 'Shader packs' },
          ]"
          :key="category.id"
          :aria-pressed="tab === category.id"
          @click="tab = category.id as Section"
        >
          {{ category.label }}
        </button>
      </div>
      <p v-if="!desktop" class="instance-notice">
        Local files are available in the installed desktop app. This browser
        preview does not access your computer’s instance folders.
      </p>
      <p v-if="filesBusy" class="muted" role="status">
        Reading instance files…
      </p>
      <div v-else-if="error" class="instance-files-empty">
        <h2>Files could not be refreshed</h2>
        <p class="muted">Check the message below, then retry.</p>
        <button
          class="button secondary"
          :disabled="actionBusy"
          @click="refresh"
        >
          Retry files
        </button>
      </div>
      <div v-else-if="!visible.length" class="instance-files-empty">
        <component
          :is="
            sectionView === 'worlds'
              ? Globe
              : sectionView === 'logs'
                ? ScrollText
                : Boxes
          "
          :size="28"
        />
        <h2>
          {{
            search
              ? "No matching files"
              : sectionView === "worlds"
                ? "No worlds yet"
                : sectionView === "logs"
                  ? "No game logs yet"
                  : "No content added yet"
          }}
        </h2>
        <p class="muted">
          {{
            search
              ? "Try another filename."
              : sectionView === "worlds"
                ? "Worlds saved in this instance will appear here."
                : sectionView === "logs"
                  ? "Existing .log files in the instance logs folder will appear here."
                  : "Import a local mod or pack, or open its folder to add files."
          }}
        </p>
      </div>
      <div v-else class="instance-file-list">
        <div class="instance-file-list-heading">
          <span>{{
            sectionView === "worlds"
              ? "World"
              : sectionView === "logs"
                ? "Log file"
                : "File"
          }}</span
          ><span>Actions</span>
        </div>
        <article
          v-for="entry in visible"
          :key="entry.name"
          class="instance-file-row"
        >
          <span class="file-symbol"
            ><component
              :is="
                entry.directory
                  ? Globe
                  : sectionView === 'logs'
                    ? ScrollText
                    : Boxes
              "
              :size="21"
          /></span>
          <div class="file-identity">
            <strong>{{ entry.name.replace(/\.disabled$/, "") }}</strong
            ><span
              >{{ entry.directory ? "World folder" : prettySize(entry.size)
              }}<template v-if="!entry.enabled"> · Disabled</template></span
            >
          </div>
          <div class="instance-inline-actions">
            <template v-if="sectionView === 'content'"
              ><button
                class="content-switch"
                role="switch"
                :aria-checked="entry.enabled"
                :aria-label="'Enable ' + entry.name.replace(/\.disabled$/, '')"
                :disabled="actionBusy"
                @click="toggleContent(entry.name)"
              >
                <span /></button
              ><button
                class="icon-button danger"
                :aria-label="'Remove ' + entry.name"
                :disabled="actionBusy"
                @click="ask('remove-file', entry.name)"
              >
                <Trash2 :size="17" /></button></template
            ><button
              v-else
              class="button secondary"
              :disabled="actionBusy"
              @click="
                sectionView === 'worlds'
                  ? openFolder(entry.name)
                  : readLog(entry.name)
              "
            >
              {{ sectionView === "worlds" ? "Open world folder" : "View log" }}
            </button>
          </div>
        </article>
      </div>
      <section v-if="logName" class="instance-log">
        <h2>{{ logName }}</h2>
        <p class="muted">
          Showing the last 64 KB. Common credential lines are hidden. Review
          logs before sharing.
        </p>
        <pre tabindex="0" aria-label="Game log output">{{
          log || "This log is empty."
        }}</pre>
      </section>
    </template>
    <p v-if="error" class="inline-error instance-feedback" role="alert">
      {{ error }}
    </p>
    <p v-if="notice" class="instance-feedback" role="status">
      <Check :size="16" />{{ notice }}
    </p>
  </div>
  <InstanceDialog
    v-if="editInstallation && instance"
    :instance="instance"
    @close="
      editInstallation = false;
      loadPreferences();
    "
  />
  <dialog
    ref="confirmDialog"
    class="instance-dialog small-dialog"
    aria-labelledby="instance-confirm-title"
    @cancel.prevent="closeConfirm"
  >
    <h2 id="instance-confirm-title">
      {{
        operation === "duplicate"
          ? "Duplicate instance?"
          : operation === "remove-file"
            ? "Remove this file?"
            : `Remove ${instance?.name}?`
      }}
    </h2>
    <template v-if="operation === 'duplicate'"
      ><label class="duplicate-files-option"
        ><input
          v-model="includeFiles"
          type="checkbox"
          :disabled="actionBusy || !desktop"
        />Include worlds, mods and all local files</label
      >
      <p class="muted">
        {{
          includeFiles
            ? "All files will be verified as they are copied. Large instances may take a while."
            : "Creates a new, empty instance with the same saved settings and overrides."
        }}
      </p></template
    >
    <p v-else class="muted">
      {{ operation === "remove-file" ? selectedFile : "The instance" }} will be
      moved to Azuria’s trash. Files are retained for recovery.
    </p>
    <p v-if="dialogError" class="inline-error" role="alert">
      {{ dialogError }}
    </p>
    <div class="dialog-actions">
      <button
        ref="cancelButton"
        class="button secondary"
        :disabled="actionBusy"
        @click="closeConfirm"
      >
        Cancel</button
      ><button
        :class="[
          'button',
          operation === 'duplicate' ? 'primary' : 'danger-button',
        ]"
        :disabled="actionBusy"
        @click="confirmed"
      >
        {{
          actionBusy
            ? "Working…"
            : operation === "duplicate"
              ? "Create duplicate"
              : "Move to trash"
        }}
      </button>
    </div>
  </dialog>
</template>

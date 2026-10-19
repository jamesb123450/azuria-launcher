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
  Camera,
  Search,
  RefreshCw,
  Upload,
  Trash2,
  Copy,
  SlidersHorizontal,
  Check,
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
import LiveLogs from "../components/LiveLogs.vue";
import LaunchControl from "../components/LaunchControl.vue";
import IconPicker from "../components/IconPicker.vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import InstanceDialog from "../components/InstanceDialog.vue";
import LaunchOptionsEditor from "../components/LaunchOptionsEditor.vue";
import "./instance.css";
import InstanceContent from "../components/InstanceContent.vue";
import { MoreVertical } from "@lucide/vue";
import ContentIcon from "../components/ContentIcon.vue";
import { contentApi, type Inventory } from "../content-api";
import { useContent } from "../stores/content";
const content = useContent();
const inventory = ref<Inventory>({ pack: null, projects: [], files: [] }),
  inventoryBusy = ref(false),
  inventoryError = ref("");
let inventoryRequest = 0;
async function checkUpdates() {
  if (!desktop || !instance.value) return;
  const token = ++inventoryRequest;
  inventoryBusy.value = true;
  inventoryError.value = "";
  try {
    const result = await contentApi.inventory(id.value);
    if (token === inventoryRequest) inventory.value = result;
  } catch (e) {
    if (token === inventoryRequest) inventoryError.value = String(e);
  } finally {
    if (token === inventoryRequest) inventoryBusy.value = false;
  }
}
const store = useLauncher();
const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id));
const instance = computed(() => store.instances.find((i) => i.id === id.value));
const settings = ref(false);
const settingsSection = ref("general");
const settingsDialog = ref<HTMLDialogElement>();
const settingsClose = ref<HTMLButtonElement>();
let settingsTrigger: HTMLElement | null = null;
async function openSettings(section = "general") {
  if (settings.value) return;
  settingsTrigger = document.activeElement as HTMLElement;
  settingsSection.value = section;
  settings.value = true;
  await loadPreferences();
  await nextTick();
  settingsDialog.value?.showModal();
  settingsClose.value?.focus();
}
async function closeSettings() {
  if (!leave()) return;
  if (preferencesReady.value) discard();
  settingsDialog.value?.close();
  settings.value = false;
  settingsTrigger?.focus();
  if (route.query.settings) await router.replace({ query: {} });
}
const tab = ref<Section>("resourcePacks");
watch(
  () => instance.value?.loader,
  (loader) => {
    if (loader === "vanilla" && tab.value === "mods")
      tab.value = "resourcePacks";
    else if (loader && loader !== "vanilla") tab.value = "mods";
  },
  { immediate: true },
);
const sectionView = ref<"content" | "worlds" | "logs">(
  route.query.tab === "logs" ? "logs" : "content",
);
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === "logs") sectionView.value = "logs";
  },
);
const showLiveLogs = computed(() => sectionView.value === "logs");
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
watch(
  () => content.job?.stage,
  (stage) => {
    if (stage === "installed") {
      void checkUpdates();
      if (sectionView.value !== "content") void refresh();
    }
  },
);
const section = computed<Section>(() =>
  sectionView.value === "content" ? tab.value : sectionView.value,
);
watch(
  () => instance.value?.id,
  () => {
    settingsDialog.value?.close();
    settings.value = false;
    allowLeave = false;
    inventory.value = { pack: null, projects: [], files: [] };
    if (instance.value?.loader === "vanilla" && tab.value === "mods")
      tab.value = "resourcePacks";
    void loadPreferences();
    void checkUpdates();
    if (sectionView.value !== "content") void refresh();
  },
  { immediate: true },
);
watch(section, () => {
  search.value = "";
  log.value = "";
  logName.value = "";
  if (sectionView.value !== "content") void refresh();
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
watch(
  () => [route.query.settings, instance.value?.id],
  () => {
    if (route.query.settings && instance.value)
      void openSettings(String(route.query.settings));
  },
  { immediate: true },
);
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
    <RouterLink class="instance-back text-link" to="/"
      ><ArrowLeft :size="16" />{{ "Library" }}</RouterLink
    >
    <header class="instance-page-header">
      <ContentIcon
        v-if="inventory.pack"
        :url="inventory.pack.project.iconUrl"
        :name="inventory.pack.project.name"
      />
      <InstanceIcon
        v-else
        :loader="instance.loader"
        :seed="instance.id"
        :icon="instance.icon"
      />
      <div class="instance-page-identity">
        <h1>
          {{ instance.name }}
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
        <LaunchControl :instance="instance" />
        <button
          class="icon-button instance-settings-shortcut"
          title="Settings"
          aria-label="Settings"
          @click="openSettings()"
        >
          <Settings :size="19" />
        </button>
        <details
          class="instance-header-menu"
          @keydown.esc="
            ($event.currentTarget as HTMLDetailsElement).open = false
          "
        >
          <summary
            class="icon-button"
            aria-label="More instance actions"
            title="More actions"
          >
            <MoreVertical :size="20" />
          </summary>
          <div>
            <button
              :disabled="!desktop || actionBusy"
              @click="
                instanceApi.open(id).catch((e) => (error = String(e)));
                ($event.currentTarget as HTMLElement)
                  .closest('details')
                  ?.removeAttribute('open');
              "
            >
              <FolderOpen :size="16" />Open folder</button
            ><button
              @click="
                ask('duplicate');
                ($event.currentTarget as HTMLElement)
                  .closest('details')
                  ?.removeAttribute('open');
              "
            >
              <Copy :size="16" />Duplicate instance</button
            ><button
              class="danger"
              @click="
                ask('remove-instance');
                ($event.currentTarget as HTMLElement)
                  .closest('details')
                  ?.removeAttribute('open');
              "
            >
              <Trash2 :size="16" />Remove instance
            </button>
          </div>
        </details>
      </div>
    </header>
    <dialog
      v-if="settings"
      ref="settingsDialog"
      class="instance-settings-modal"
      aria-labelledby="instance-settings-title"
      @cancel.prevent="closeSettings"
    >
      <header class="settings-modal-heading">
        <div>
          <span class="muted">{{ instance.name }}</span>
          <h2 id="instance-settings-title">Instance settings</h2>
        </div>
        <button
          ref="settingsClose"
          class="icon-button"
          aria-label="Close instance settings"
          @click="closeSettings"
        >
          ×
        </button>
      </header>
      <div class="instance-settings-layout">
        <nav class="instance-settings-nav" aria-label="Instance settings">
          <button
            type="button"
            v-for="item in [
              { id: 'general', label: 'General', icon: Settings },
              { id: 'installation', label: 'Installation', icon: Boxes },
              { id: 'overrides', label: 'Overrides', icon: SlidersHorizontal },
            ]"
            :key="item.id"
            :aria-pressed="settingsSection === item.id"
            @click="settingsSection = item.id"
          >
            <component :is="item.icon" :size="17" />{{ item.label }}</button
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
                    <IconPicker
                      v-model="general.icon"
                      :loader="instance.loader"
                      :seed="instance.id"
                    />
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
                  <dd>
                    {{
                      ["vanilla", "fabric"].includes(instance.loader)
                        ? "Downloads after creation; checked again on Play"
                        : "Loader launching coming soon"
                    }}
                  </dd>
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
                instance. Saved settings apply on the next supported launch.
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
      <p v-if="error" class="inline-error instance-feedback" role="alert">
        {{ error }}
      </p>
      <p v-if="notice" class="instance-feedback" role="status">{{ notice }}</p>
    </dialog>
    <template v-if="true">
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
        <RouterLink
          class="instance-section-link"
          :to="`/screenshots?instance=${id}`"
          ><Camera :size="17" />Screenshots</RouterLink
        >
      </nav>
      <LiveLogs v-if="showLiveLogs" :id="id" />
      <InstanceContent
        v-else-if="sectionView === 'content'"
        :key="id"
        :id="id"
        :loader="instance.loader"
        :inventory="inventory"
        :checking="inventoryBusy"
        :check-error="inventoryError"
        @check="checkUpdates"
        @settings="openSettings()"
      />
      <section v-else>
        <div class="instance-content-toolbar">
          <label class="search-box"
            ><Search :size="17" /><input
              v-model="search"
              aria-label="Search worlds"
              placeholder="Search worlds…" /></label
          ><button
            class="icon-button"
            aria-label="Open worlds folder"
            title="Open folder"
            :disabled="!desktop || actionBusy"
            @click="openFolder()"
          >
            <FolderOpen :size="18" /></button
          ><button
            class="icon-button"
            aria-label="Refresh instance files"
            title="Refresh"
            :disabled="filesBusy"
            @click="refresh"
          >
            <RefreshCw :size="17" />
          </button>
        </div>
        <p v-if="filesBusy" class="muted" role="status">
          Reading instance files…
        </p>
        <p v-else-if="error" class="inline-error">{{ error }}</p>
        <div v-else-if="!visible.length" class="instance-files-empty">
          <Globe :size="28" />
          <h2>{{ search ? "No matching files" : "No worlds yet" }}</h2>
          <p class="muted">
            {{
              search
                ? "Try another filename."
                : "Worlds saved in this instance will appear here."
            }}
          </p>
        </div>
        <div v-else class="instance-file-list">
          <article
            v-for="entry in visible"
            :key="entry.name"
            class="instance-file-row"
          >
            <span class="file-symbol"><Globe :size="21" /></span>
            <div class="file-identity">
              <strong>{{ entry.name }}</strong
              ><span>World folder</span>
            </div>
            <button
              class="icon-button"
              :aria-label="'Open ' + entry.name"
              title="Open world folder"
              :disabled="!desktop || actionBusy"
              @click="openFolder(entry.name)"
            >
              <FolderOpen :size="17" />
            </button>
          </article>
        </div>
      </section>
    </template>
    <p
      v-if="error && !settings"
      class="inline-error instance-feedback"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-if="notice && !settings" class="instance-feedback" role="status">
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

<style scoped>
.instance-settings-shortcut {
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--panel);
}
.instance-header-menu {
  position: relative;
}
.instance-header-menu summary {
  list-style: none;
  cursor: pointer;
}
.instance-header-menu summary::-webkit-details-marker {
  display: none;
}
.instance-header-menu[open] > div {
  position: absolute;
  right: 0;
  top: 42px;
  z-index: 20;
  width: 205px;
  padding: 7px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  box-shadow: 0 12px 35px #0005;
}
.instance-header-menu button {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: 0;
  width: 100%;
  padding: 11px;
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.instance-header-menu button:hover {
  background: var(--hover);
}
.instance-header-menu button.danger {
  color: var(--pink);
}
</style>

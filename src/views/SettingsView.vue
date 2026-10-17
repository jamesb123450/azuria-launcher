<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  X,
  Palette,
  SlidersHorizontal,
  UserRound,
  Coffee,
  Monitor,
  FolderOpen,
  Download,
  Wrench,
  Globe,
  Code,
  RefreshCw,
  ShieldCheck,
  Users,
} from "@lucide/vue";
import { useLauncher } from "../stores/launcher";
import { useUpdates } from "../stores/updates";
import { desktop } from "../api";
import { instanceApi } from "../instance-api";
import { defaultLaunchOptions, validateOptions } from "../lib/launch-options";
import AccountPanel from "../components/AccountPanel.vue";
import StoragePanel from "../components/StoragePanel.vue";
import {
  resourceApi,
  defaultResources,
  resourceValidation,
} from "../resource-api";
import UpdatePanel from "../components/UpdatePanel.vue";
import LaunchOptionsEditor from "../components/LaunchOptionsEditor.vue";
import { contentApi } from "../content-api";
import type { Theme } from "../types";
import "./instance.css";
import "./settings.css";
const emit = defineEmits<{ close: [] }>();
const store = useLauncher();
const updates = useUpdates();
const route = useRoute();
const router = useRouter();
const dialog = ref<HTMLDialogElement>();
const section = ref(
  route.hash === "#account"
    ? "account"
    : route.hash === "#launch-defaults"
      ? "java"
      : route.hash === "#content-providers"
        ? "providers"
        : route.hash === "#storage"
          ? "storage"
          : "appearance",
);
const groups = [
  {
    label: "Display",
    items: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "features", label: "Features", icon: SlidersHorizontal },
      { id: "behaviour", label: "Behaviour", icon: SlidersHorizontal },
      { id: "language", label: "Language", icon: Globe },
    ],
  },
  {
    label: "Account",
    items: [
      { id: "account", label: "Profile", icon: UserRound },
      { id: "social", label: "Social", icon: Users },
      { id: "privacy", label: "Privacy", icon: ShieldCheck },
    ],
  },
  {
    label: "Instance defaults",
    items: [
      { id: "java", label: "Java & memory", icon: Coffee },
      { id: "window", label: "Game window", icon: Monitor },
      { id: "hooks", label: "Launch hooks", icon: Code },
      { id: "sync", label: "Syncing", icon: RefreshCw },
    ],
  },
  {
    label: "System",
    items: [
      { id: "providers", label: "Content providers", icon: Download },
      { id: "storage", label: "Storage", icon: FolderOpen },
      { id: "updates", label: "Updates", icon: Download },
      { id: "troubleshooting", label: "Troubleshooting", icon: Wrench },
    ],
  },
];
const planned: Record<string, { title: string; description: string }[]> = {
  features: [
    {
      title: "Sidebar shortcuts",
      description:
        "Choose which skin and screenshot shortcuts appear in the launcher.",
    },
    {
      title: "Instance tabs",
      description: "Choose which content tabs appear in your instances.",
    },
  ],
  behaviour: [
    {
      title: "Minimise when Minecraft starts",
      description: "Keep the launcher out of the way while playing.",
    },
    {
      title: "Refocus after Minecraft closes",
      description: "Return to Azuria when your game ends.",
    },
    {
      title: "Sidebar visibility",
      description: "Choose whether the right sidebar opens by default.",
    },
    {
      title: "Compact library",
      description: "Display instances in a smaller row layout.",
    },
  ],
  language: [
    {
      title: "Launcher language",
      description:
        "Additional interface languages. Azuria currently uses English.",
    },
  ],
  social: [
    {
      title: "Social features",
      description:
        "Account social preferences will appear here when supported.",
    },
  ],
  privacy: [
    {
      title: "Privacy preferences",
      description:
        "Additional privacy controls will appear here when supported.",
    },
  ],
  hooks: [
    {
      title: "Pre-launch command",
      description: "Run a command before Minecraft starts.",
    },
    {
      title: "Wrapper command",
      description: "Wrap the Minecraft launch process.",
    },
    {
      title: "Post-exit command",
      description: "Run a command after the game closes.",
    },
  ],
  sync: [
    {
      title: "Sync game options",
      description: "Share selected game preferences between instances.",
    },
    {
      title: "Sync servers & resource packs",
      description: "Reuse server lists and resource packs across instances.",
    },
    {
      title: "Sync across devices",
      description: "Keep launcher preferences across devices.",
    },
  ],
  troubleshooting: [
    { title: "Clear cache", description: "Rebuild cached launcher content." },
    {
      title: "Verify & repair",
      description: "Check downloaded game files and repair missing content.",
    },
    {
      title: "Export diagnostics",
      description: "Export launcher logs for troubleshooting.",
    },
  ],
};
const heading = computed(
  () =>
    groups.flatMap((g) => g.items).find((i) => i.id === section.value)?.label ??
    "Settings",
);
const theme = ref<Theme>(store.settings.theme);
const form = ref(defaultLaunchOptions());
const savedTheme = ref<Theme>(theme.value);
const snapshot = ref("");
const loaded = ref(false);
const busy = ref(false);
const error = ref("");
const notice = ref("");
const confirmClose = ref(false);
const curseforgeKey = ref("");
const removeCurseforgeKey = ref(false);
const curseforgeConfigured = ref(false);
const providerError = ref("");
const keyChanged = computed(
  () => !!curseforgeKey.value.trim() || removeCurseforgeKey.value,
);
watch(
  section,
  async (value) => {
    if (value !== "providers") return;
    providerError.value = "";
    try {
      curseforgeConfigured.value = (
        await contentApi.status()
      ).curseforgeConfigured;
    } catch (e) {
      providerError.value = String(e);
    }
  },
  { immediate: true },
);
const resources = ref(defaultResources());
const resourceSnapshot = ref(JSON.stringify(resources.value));
const resourceReady = ref(false);
const resourceBusy = ref(false);
const resourceError = ref("");
const resourceChanged = computed(
  () =>
    resourceReady.value &&
    JSON.stringify(resources.value) !== resourceSnapshot.value,
);
watch(
  section,
  async (value) => {
    if (value !== "storage" || resourceReady.value) return;
    resourceError.value = "";
    try {
      const value = await resourceApi.options();
      if (!value || resourceValidation(value))
        throw new Error(
          "Storage preferences could not be loaded. Reopen Storage to retry.",
        );
      resources.value = value;
      resourceSnapshot.value = JSON.stringify(value);
      resourceReady.value = true;
    } catch (e) {
      resourceError.value = String(e);
    }
  },
  { immediate: true },
);
const dirty = computed(
  () =>
    loaded.value &&
    (resourceChanged.value ||
      keyChanged.value ||
      theme.value !== savedTheme.value ||
      JSON.stringify(form.value) !== snapshot.value),
);
function reset() {
  resources.value = JSON.parse(resourceSnapshot.value);
  curseforgeKey.value = "";
  removeCurseforgeKey.value = false;
  theme.value = savedTheme.value;
  if (snapshot.value) form.value = JSON.parse(snapshot.value);
  error.value = "";
  notice.value = "";
}
async function load() {
  busy.value = true;
  error.value = "";
  try {
    if (!store.settingsReady) await store.init();
    if (!store.settingsReady)
      throw new Error(
        store.settingsError || "Appearance settings could not be loaded.",
      );
    form.value = await instanceApi.defaults();
    theme.value = savedTheme.value = store.settings.theme;
    snapshot.value = JSON.stringify(form.value);
    loaded.value = true;
  } catch (e) {
    error.value = String(e instanceof Error ? e.message : e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!loaded.value || busy.value) return false;
  error.value = resourceChanged.value
    ? resourceValidation(resources.value)
    : validateOptions(form.value);
  notice.value = "";
  if (error.value) {
    section.value = resourceChanged.value
      ? "storage"
      : /window|resolution/i.test(error.value)
        ? "window"
        : "java";
    return false;
  }
  busy.value = true;
  try {
    if (JSON.stringify(form.value) !== snapshot.value) {
      await instanceApi.saveDefaults(form.value);
      snapshot.value = JSON.stringify(form.value);
    }
    if (theme.value !== savedTheme.value) {
      await store.theme(theme.value);
      if (store.settingsError) throw new Error(store.settingsError);
      if (store.settings.theme !== theme.value)
        throw new Error("Appearance could not be saved. Please retry.");
      savedTheme.value = theme.value;
    }
    if (resourceChanged.value) {
      await resourceApi.save(resources.value);
      resourceSnapshot.value = JSON.stringify(resources.value);
    }
    if (keyChanged.value) {
      await contentApi.setKey(
        removeCurseforgeKey.value ? null : curseforgeKey.value.trim(),
      );
      curseforgeConfigured.value = !removeCurseforgeKey.value;
      curseforgeKey.value = "";
      removeCurseforgeKey.value = false;
    }
    notice.value = "Settings saved.";
    return true;
  } catch (e) {
    error.value = `Some settings could not be saved: ${String(e instanceof Error ? e.message : e)}. Your remaining edits are kept; retry Save.`;
    return false;
  } finally {
    busy.value = false;
  }
}
function requestClose() {
  if (busy.value || resourceBusy.value) return;
  if (dirty.value) confirmClose.value = true;
  else emit("close");
}
async function saveAndClose() {
  if (await save()) {
    confirmClose.value = false;
    emit("close");
  }
}
function discardAndClose() {
  reset();
  confirmClose.value = false;
  emit("close");
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
const removeGuard = router.beforeEach((to) => {
  if (
    to.path !== "/settings" &&
    (busy.value || resourceBusy.value || dirty.value)
  ) {
    if (!busy.value && !resourceBusy.value) confirmClose.value = true;
    return false;
  }
});
watch(
  () => route.hash,
  (hash) => {
    if (hash === "#storage") section.value = "storage";
    if (hash === "#account") section.value = "account";
    if (hash === "#content-providers") section.value = "providers";
  },
);
const previousFocus = document.activeElement as HTMLElement | null;
onMounted(async () => {
  dialog.value?.showModal();
  await load();
});
watch(confirmClose, async () => {
  await nextTick();
  dialog.value
    ?.querySelector<HTMLButtonElement>(
      confirmClose.value ? "[data-keep-editing]" : ".settings-close",
    )
    ?.focus();
});
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => {
  removeGuard();
  window.removeEventListener("beforeunload", beforeUnload);
  dialog.value?.close();
  if (previousFocus?.isConnected) previousFocus.focus();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="launcher-settings"
    aria-labelledby="settings-heading"
    @cancel.prevent="requestClose"
  >
    <header class="settings-modal-header">
      <div>
        <h1 id="settings-heading">Settings</h1>
        <p>Your launcher, your way.</p>
      </div>
      <button
        class="icon-button settings-close"
        aria-label="Close settings"
        :disabled="busy || resourceBusy"
        @click="requestClose"
      >
        <X :size="20" />
      </button>
    </header>
    <div class="settings-modal-body" :inert="confirmClose">
      <nav class="settings-categories" aria-label="Settings categories">
        <div
          v-for="group in groups"
          :key="group.label"
          class="settings-category-group"
        >
          <p>{{ group.label }}</p>
          <button
            v-for="item in group.items"
            :key="item.id"
            :aria-current="section === item.id ? 'page' : undefined"
            :class="{ active: section === item.id }"
            @click="section = item.id"
          >
            <component :is="item.icon" :size="17" />{{ item.label }}
          </button>
        </div>
        <p class="settings-version">
          Azuria Launcher <span>{{ updates.version }}</span>
        </p>
      </nav>
      <div
        :key="section"
        class="settings-modal-content"
        tabindex="0"
        :aria-label="heading"
      >
        <h2>{{ heading }}</h2>
        <template v-if="section === 'appearance'"
          ><p class="muted">
            Choose the look that feels right for you. Changes apply after
            saving.
          </p>
          <div class="settings-theme-grid">
            <button
              v-for="option in ['dark', 'light', 'system'] as const"
              :key="option"
              :disabled="!loaded || busy"
              :aria-pressed="theme === option"
              :class="[
                'settings-theme-card',
                option,
                { selected: theme === option },
              ]"
              @click="theme = option"
            >
              <span class="settings-theme-sample" aria-hidden="true"
                ><i /><span><i /><i /></span></span
              ><strong>{{
                option === "system"
                  ? "System"
                  : option === "dark"
                    ? "Dark"
                    : "Light"
              }}</strong
              ><span>{{
                option === "system"
                  ? "Follow your device"
                  : `Use the ${option} theme`
              }}</span>
            </button>
          </div>
          <div class="settings-planned-row">
            <div>
              <h3>OLED theme</h3>
              <p>A deeper black appearance.</p>
            </div>
            <span class="coming-soon">Coming soon</span>
          </div></template
        >
        <template v-else-if="section === 'providers'">
          <p class="settings-inheritance">
            Modrinth search and downloads use its public API. CurseForge
            requires approved API access for Azuria.
          </p>
          <div class="settings-planned-row">
            <div>
              <h3>Modrinth</h3>
              <p>Ready to use. No API key required.</p>
            </div>
          </div>
          <div class="settings-storage-path">
            <h3>CurseForge API access</h3>
            <p>
              {{
                curseforgeConfigured
                  ? "A key is stored in Windows Credential Manager on this PC."
                  : "No API key is stored on this PC."
              }}
            </p>
            <p v-if="providerError" class="inline-error">{{ providerError }}</p>
            <label class="instance-field"
              >{{ curseforgeConfigured ? "Replacement API key" : "API key"
              }}<input
                v-model="curseforgeKey"
                type="password"
                autocomplete="off"
                spellcheck="false"
                :disabled="!desktop || busy || removeCurseforgeKey"
            /></label>
            <label v-if="curseforgeConfigured"
              ><input
                v-model="removeCurseforgeKey"
                type="checkbox"
                :disabled="busy"
              />Remove the saved key when I press Save</label
            >
            <p class="muted">
              Use an approved key. It is stored natively, never in your instance
              settings, browser storage or repository. Save and Reset below
              apply to these changes too.
            </p>
          </div>
        </template>
        <AccountPanel v-else-if="section === 'account'" />
        <UpdatePanel v-else-if="section === 'updates'" />
        <template v-else-if="section === 'java' || section === 'window'"
          ><p class="settings-inheritance">
            Instances inherit these defaults unless an instance override is
            enabled. Changes apply on the next launch.
          </p>
          <LaunchOptionsEditor
            v-if="loaded"
            v-model="form"
            :section="section"
            :disabled="busy"
        /></template>
        <template v-if="section === 'storage'">
          <StoragePanel
            :disabled="busy"
            :unsaved="resourceChanged"
            :revision="resourceSnapshot"
            @busy="resourceBusy = $event"
          />
          <p v-if="resourceError" class="inline-error" role="alert">
            {{ resourceError }}
          </p>
          <fieldset
            class="storage-preferences"
            :disabled="!resourceReady || busy || resourceBusy"
          >
            <legend>Download preferences</legend>
            <label class="instance-field"
              >Keep unused downloads (GiB)<input
                v-model.number="resources.unusedDownloadGib"
                type="number"
                min="0"
                max="100"
                step="1"
            /></label>
            <p class="muted">
              Keep up to this amount of abandoned staging downloads when you run
              cleanup. Use 0 to clear eligible files. Recent downloads are
              always kept for 24 hours.
            </p>
            <label class="instance-field"
              >Maximum concurrent downloads<input
                v-model.number="resources.concurrentDownloads"
                type="number"
                min="1"
                max="16"
                step="1"
            /></label>
            <p class="muted">
              Limits Minecraft’s asset download pool on the next preparation.
              Content packs currently download sequentially. Save or Reset these
              preferences below.
            </p>
          </fieldset>
        </template>
        <p v-if="section === 'privacy'" class="settings-inheritance">
          This build does not collect analytics or upload your logs. Microsoft
          credentials are handled by the desktop account system.
        </p>
        <div
          v-for="item in planned[section] ?? []"
          :key="item.title"
          class="settings-planned-row"
        >
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </div>
          <span class="coming-soon">Coming soon</span>
        </div>
      </div>
    </div>
    <footer class="settings-modal-footer" :inert="confirmClose">
      <div class="settings-save-status">
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <p v-else role="status">
          {{
            busy
              ? loaded
                ? "Saving…"
                : "Loading settings…"
              : notice ||
                (dirty ? "You have unsaved changes." : "All changes saved.")
          }}
        </p>
        <button v-if="!loaded && !busy" class="text-link" @click="load">
          Retry loading settings
        </button>
      </div>
      <button
        class="button secondary"
        :disabled="busy || resourceBusy || !dirty"
        @click="reset"
      >
        Reset</button
      ><button
        class="button primary"
        :disabled="busy || resourceBusy || !dirty"
        @click="save"
      >
        Save
      </button>
    </footer>
    <div v-if="confirmClose" class="settings-discard-layer">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="settings-discard-title"
        class="settings-discard-card"
      >
        <h2 id="settings-discard-title">Save your changes?</h2>
        <p>
          You have unsaved settings. Save them before closing, or discard your
          edits.
        </p>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <div>
          <button
            data-keep-editing
            class="button secondary"
            :disabled="busy"
            @click="confirmClose = false"
          >
            Keep editing</button
          ><button
            class="button secondary"
            :disabled="busy"
            @click="discardAndClose"
          >
            Discard</button
          ><button
            class="button primary"
            :disabled="busy"
            @click="saveAndClose"
          >
            Save & close
          </button>
        </div>
      </section>
    </div>
  </dialog>
</template>

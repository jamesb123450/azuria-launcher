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
import { usePrivacy } from "../stores/privacy";
import { defaultPrivacy } from "../privacy-api";
import { loadMemory, memoryLimit } from "../system-memory";
import { useBehaviour } from "../stores/behaviour";
import { behaviourApi, defaultBehaviour } from "../behaviour-api";
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
const behaviourStore = useBehaviour();
const privacyStore = usePrivacy();
const privacyForm = ref(defaultPrivacy());
const privacySnapshot = ref(JSON.stringify(privacyForm.value));
const privacyLoaded = ref(false);
const privacyError = ref("");
const privacyChanged = computed(
  () =>
    privacyLoaded.value &&
    JSON.stringify(privacyForm.value) !== privacySnapshot.value,
);
async function loadPrivacy() {
  await privacyStore.load();
  privacyError.value = privacyStore.error;
  if (privacyStore.ready) {
    privacyForm.value = { ...privacyStore.options };
    privacySnapshot.value = JSON.stringify(privacyForm.value);
    privacyLoaded.value = true;
  }
}
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
const curseforgeConfigured = ref(false);
const providerError = ref("");
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
const behaviourForm = ref(defaultBehaviour());
const behaviourSnapshot = ref(JSON.stringify(behaviourForm.value));
const behaviourLoaded = ref(false);
const behaviourError = ref("");
const discordConfigured = ref(false);
const behaviourChanged = computed(
  () =>
    behaviourLoaded.value &&
    JSON.stringify(behaviourForm.value) !== behaviourSnapshot.value,
);
const behaviourItems = [
  {
    key: "minimiseOnStart",
    title: "Minimise when Minecraft starts",
    description: "Keep Azuria out of the way once the game is running.",
  },
  {
    key: "refocusOnExit",
    title: "Refocus after Minecraft closes",
    description: "Bring Azuria back when your last running game exits.",
  },
  {
    key: "hideRightSidebar",
    title: "Hide the right sidebar by default",
    description:
      "Start with more space in your library. You can still show the sidebar from its toolbar button.",
  },
  {
    key: "compactLibrary",
    title: "Compact library",
    description:
      "Open your instances in the compact list view. The grid and list buttons remain available.",
  },
  {
    key: "discordPresence",
    title: "Discord Rich Presence",
    description:
      "Show that you are playing Minecraft while a game is running. Account details, server addresses and world names are never included.",
  },
] as const;
async function loadBehaviour() {
  behaviourError.value = "";
  await behaviourStore.load();
  if (!behaviourStore.ready) {
    behaviourError.value = behaviourStore.error;
    return;
  }
  behaviourForm.value = { ...behaviourStore.options };
  behaviourSnapshot.value = JSON.stringify(behaviourForm.value);
  behaviourLoaded.value = true;
  try {
    discordConfigured.value = await behaviourApi.discordConfigured();
  } catch {
    discordConfigured.value = false;
  }
}
watch(
  section,
  (value) => {
    if (
      (value === "behaviour" || value === "privacy") &&
      !behaviourLoaded.value
    )
      void loadBehaviour();
    if (value === "privacy" && !privacyLoaded.value) void loadPrivacy();
  },
  { immediate: true },
);
const dirty = computed(
  () =>
    loaded.value &&
    (behaviourChanged.value ||
      resourceChanged.value ||
      privacyChanged.value ||
      theme.value !== savedTheme.value ||
      JSON.stringify(form.value) !== snapshot.value),
);
function reset() {
  behaviourForm.value = JSON.parse(behaviourSnapshot.value);
  resources.value = JSON.parse(resourceSnapshot.value);
  privacyForm.value = JSON.parse(privacySnapshot.value);
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
    await loadMemory();
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
    : JSON.stringify(form.value) !== snapshot.value
      ? memoryLimit.value
        ? validateOptions(form.value)
        : "Physical memory could not be detected. Reopen Java & memory and retry."
      : "";
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
    if (behaviourChanged.value) {
      await behaviourStore.save(behaviourForm.value);
      behaviourSnapshot.value = JSON.stringify(behaviourForm.value);
    }
    if (resourceChanged.value) {
      await resourceApi.save(resources.value);
      resourceSnapshot.value = JSON.stringify(resources.value);
    }
    if (privacyChanged.value) {
      await privacyStore.save(privacyForm.value);
      privacySnapshot.value = JSON.stringify(privacyForm.value);
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
        <div class="settings-category-scroll">
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
              v-for="option in ['dark', 'oled', 'light', 'system'] as const"
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
                  : option === "oled"
                    ? "OLED"
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
        </template>
        <template v-else-if="section === 'behaviour'">
          <p class="settings-inheritance">
            Choose how Azuria behaves while you play. Changes apply after Save.
          </p>
          <p v-if="!desktop" class="muted">
            Window actions and Discord presence work in the Windows app.
          </p>
          <label
            v-for="item in behaviourItems"
            :key="item.key"
            class="settings-behaviour-row"
          >
            <span
              ><strong>{{ item.title }}</strong
              ><span :id="'behaviour-' + item.key">{{
                item.description
              }}</span></span
            >
            <input
              v-model="behaviourForm[item.key]"
              type="checkbox"
              role="switch"
              :aria-label="item.title"
              :aria-describedby="'behaviour-' + item.key"
              :disabled="!behaviourLoaded || busy"
            />
          </label>
          <p v-if="!discordConfigured" class="settings-inheritance">
            Discord presence is unavailable in this build. Your preference is
            kept for builds that support it.
          </p>
          <p v-else class="muted">
            Discord must be running with activity sharing enabled. No Discord
            sign-in is needed in Azuria.
          </p>
          <p v-if="behaviourError" class="inline-error" role="alert">
            {{ behaviourError }}
          </p>
          <button
            v-if="behaviourError"
            class="button secondary"
            @click="loadBehaviour"
          >
            Retry behaviour settings
          </button>
        </template>
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
            <h3>CurseForge</h3>
            <p>
              {{
                curseforgeConfigured
                  ? "Available through Azuria’s content service. No API key is stored on this computer."
                  : "The publisher has not configured CurseForge access for this build."
              }}
            </p>
            <p v-if="providerError" class="inline-error">{{ providerError }}</p>
          </div>
        </template>
        <template v-else-if="section === 'privacy'">
          <p class="settings-inheritance">
            Control account privacy and activity sharing. Changes apply after
            Save.
          </p>
          <label class="settings-behaviour-row"
            ><span
              ><strong>Reconnect account on startup</strong
              ><span
                >Use your securely saved Microsoft session when Azuria opens.
                Turn this off to reconnect manually from Profile.</span
              ></span
            ><input
              v-model="privacyForm.restoreAccount"
              type="checkbox"
              role="switch"
              aria-label="Reconnect account on startup"
              :disabled="!privacyLoaded || busy"
          /></label>
          <label class="settings-behaviour-row"
            ><span
              ><strong>Hide account details</strong
              ><span
                >Replace your account name and skin head with a neutral identity
                in the launcher. Skin editing remains available.</span
              ></span
            ><input
              v-model="privacyForm.hideAccount"
              type="checkbox"
              role="switch"
              aria-label="Hide account details"
              :disabled="!privacyLoaded || busy"
          /></label>
          <label class="settings-behaviour-row"
            ><span
              ><strong>Discord Rich Presence</strong
              ><span
                >Share generic Minecraft activity and its start time with your
                local Discord client. This is the same preference as
                Behaviour.</span
              ></span
            ><input
              v-model="behaviourForm.discordPresence"
              type="checkbox"
              role="switch"
              aria-label="Discord Rich Presence"
              :disabled="!behaviourLoaded || busy"
          /></label>
          <div class="settings-privacy-note">
            <h3>Your data stays yours</h3>
            <p>
              Azuria does not collect analytics or automatically upload logs.
              Microsoft credentials remain in Windows Credential Manager.
              Updates, authentication and content downloads contact their
              providers; these preferences do not disable those services.
            </p>
          </div>
          <p
            v-if="privacyError || behaviourError"
            role="alert"
            class="inline-error"
          >
            {{ privacyError || behaviourError }}
          </p>
          <button
            v-if="privacyError || behaviourError"
            class="text-link"
            @click="
              loadPrivacy();
              loadBehaviour();
            "
          >
            Retry privacy preferences
          </button>
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
            <label class="settings-control-row"
              ><span
                ><strong>Keep unused downloads</strong
                ><span
                  >Keep this much abandoned content for future installs. Cleanup
                  retains recent downloads for 24 hours.</span
                ></span
              ><span class="settings-unit-input"
                ><input
                  v-model.number="resources.unusedDownloadGib"
                  aria-label="Keep unused downloads (GiB)"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                /><span>GiB</span></span
              ></label
            >
            <label class="settings-control-row"
              ><span
                ><strong>Concurrent downloads</strong
                ><span
                  >Limit simultaneous Minecraft asset downloads. Content packs
                  download sequentially.</span
                ></span
              ><span class="settings-range-control"
                ><input
                  v-model.number="resources.concurrentDownloads"
                  aria-label="Maximum concurrent downloads"
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                /><output>{{ resources.concurrentDownloads }}</output></span
              ></label
            >
          </fieldset>
        </template>
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
    <footer
      v-if="dirty || busy || error || notice"
      class="settings-modal-footer"
      :class="{ 'has-edits': dirty }"
      :inert="confirmClose"
    >
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
        v-if="dirty"
        class="button secondary"
        :disabled="busy || resourceBusy"
        @click="reset"
      >
        Reset</button
      ><button
        v-if="dirty"
        class="button primary"
        :disabled="busy || resourceBusy"
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

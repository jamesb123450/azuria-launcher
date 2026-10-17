<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  X,
  Search,
  Boxes,
  Compass,
  Upload,
  PackageOpen,
  Shuffle,
  Palette,
  Check,
  ArrowLeft,
  Plus,
} from "@lucide/vue";
import type { Instance, Loader } from "../types";
import { DEFAULT_INPUT, LOADERS, loaderName, validateInput } from "../types";
import { useLauncher } from "../stores/launcher";
import InstanceIcon from "./InstanceIcon.vue";
import VersionPicker from "./VersionPicker.vue";
import {
  loaderVersions,
  resolveLoaderVersion,
  type LoaderVersion,
} from "../lib/loader-versions";
import {
  ICON_COLORS,
  ICON_GLYPHS,
  makeIcon,
  uploadIcon,
  type IconGlyph,
} from "../lib/instance-icons";
import { gameVersions, type GameVersion } from "../lib/game-versions";

const props = defineProps<{ instance?: Instance; duplicate?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const store = useLauncher();
const dialog = ref<HTMLDialogElement>();
const nameInput = ref<HTMLInputElement>();
const setupButton = ref<HTMLButtonElement>();
const fileInput = ref<HTMLInputElement>();
const edit = Boolean(props.instance && !props.duplicate);
const step = ref<"choose" | "setup">(props.instance ? "setup" : "choose");
const error = ref("");
const iconBusy = ref(false);
const resolvingLoader = ref(false);
const customizing = ref(false);
const color = ref(ICON_COLORS[0]!);
const glyph = ref<IconGlyph>("cube");
const form = reactive({
  ...DEFAULT_INPUT,
  ...(props.instance ?? {}),
  name: props.duplicate
    ? `${props.instance?.name ?? ""} copy`
    : (props.instance?.name ?? ""),
});
const versionChoice = ref(form.minecraftVersion || "1.21.1");
const manualVersion = ref(false);
const versions = ref<GameVersion[]>([{ id: "1.21.1", type: "release" }]);
const versionsLoading = ref(false);
const versionsError = ref("");
const snapshots = ref(false);
const allLoaderVersions = ref(false);
const loaderChoices = ref<LoaderVersion[]>([]);
const loaderLoading = ref(false);
const loaderError = ref("");
let loaderRequest = 0;
const loaderPolicy = ref(
  form.loaderVersion && !["stable", "latest"].includes(form.loaderVersion)
    ? "other"
    : (form.loaderVersion ?? "stable"),
);
const customLoaderVersion = ref(
  loaderPolicy.value === "other" ? (form.loaderVersion ?? "") : "",
);
const loaderOptions = computed(() => {
  const list = loaderChoices.value.filter(
    (entry) =>
      allLoaderVersions.value ||
      entry.stable ||
      entry.id === customLoaderVersion.value,
  );
  if (
    customLoaderVersion.value &&
    !list.some((entry) => entry.id === customLoaderVersion.value)
  ) {
    return [
      {
        value: customLoaderVersion.value,
        label: customLoaderVersion.value,
        detail: "Saved version",
      },
      ...list.map((entry) => ({
        value: entry.id,
        label: entry.id,
        detail: entry.stable ? "" : "Pre-release",
      })),
    ];
  }
  return list.map((entry) => ({
    value: entry.id,
    label: entry.id,
    detail: entry.stable ? "" : "Pre-release",
  }));
});
watch(
  () => [form.loader, form.minecraftVersion],
  () => {
    loaderRequest++;
    loaderLoading.value = false;
    loaderChoices.value = [];
    loaderError.value = "";
    customLoaderVersion.value = "";
    loaderPolicy.value = "stable";
    allLoaderVersions.value = false;
  },
);
watch(loaderPolicy, (policy) => {
  if (policy === "other") void loadLoaderVersions();
});
async function loadLoaderVersions() {
  if (!form.minecraftVersion || form.loader === "vanilla") return;
  const request = ++loaderRequest;
  loaderLoading.value = true;
  loaderError.value = "";
  try {
    const list = await loaderVersions(form.loader, form.minecraftVersion);
    if (disposed || request !== loaderRequest) return;
    loaderChoices.value = list;
    if (!list.length)
      loaderError.value =
        "No loader versions are available for this Minecraft version.";
    if (
      customLoaderVersion.value &&
      !list.some((entry) => entry.id === customLoaderVersion.value)
    ) {
      // Existing instances retain their stored version when the provider delists it.
      return;
    }
    if (!customLoaderVersion.value)
      customLoaderVersion.value =
        list.find((entry) => entry.stable)?.id ?? list[0]?.id ?? "";
  } catch {
    if (!disposed && request === loaderRequest)
      loaderError.value =
        "Couldn’t load loader versions. Check your connection and retry.";
  } finally {
    if (!disposed && request === loaderRequest) loaderLoading.value = false;
  }
}
const suggestedName = computed(
  () =>
    `${loaderName(form.loader)} ${form.minecraftVersion || versionChoice.value}`,
);
const availableVersions = computed(() => {
  const list = versions.value.filter(
    (entry) => snapshots.value || entry.type === "release",
  );
  if (
    versionChoice.value &&
    versionChoice.value !== "__manual" &&
    !list.some((entry) => entry.id === versionChoice.value)
  )
    return [{ id: versionChoice.value, type: "selected" }, ...list];
  return list;
});
let previousFocus: HTMLElement | null = null;
let disposed = false;
let versionTouched = false;
let uploadSequence = 0;

onMounted(async () => {
  previousFocus = document.activeElement as HTMLElement;
  dialog.value?.showModal();
  await nextTick();
  if (step.value === "choose") setupButton.value?.focus();
  else nameInput.value?.focus();
  void loadVersions();
  if (loaderPolicy.value === "other") void loadLoaderVersions();
});
onBeforeUnmount(() => {
  disposed = true;
  dialog.value?.close();
  previousFocus?.focus();
});
async function loadVersions() {
  versionsLoading.value = true;
  versionsError.value = "";
  try {
    const entries = await gameVersions();
    if (!disposed) {
      versions.value = entries;
      const latest = entries.find((entry) => entry.type === "release");
      if (!props.instance && !versionTouched && latest) {
        versionChoice.value = latest.id;
        form.minecraftVersion = latest.id;
      }
    }
  } catch {
    if (!disposed)
      versionsError.value =
        "Couldn’t load the version list. You can enter a version manually.";
  } finally {
    if (!disposed) versionsLoading.value = false;
  }
}
async function customSetup() {
  step.value = "setup";
  if (!form.minecraftVersion && !manualVersion.value)
    form.minecraftVersion = versionChoice.value;
  await nextTick();
  nameInput.value?.focus();
}
async function back() {
  step.value = "choose";
  error.value = "";
  await nextTick();
  setupButton.value?.focus();
}
function selectVersion(value: string) {
  versionChoice.value = value;
  versionTouched = true;
  manualVersion.value = versionChoice.value === "__manual";
  if (!manualVersion.value) form.minecraftVersion = versionChoice.value;
  else form.minecraftVersion = "";
}
function selectLoader(loader: Loader) {
  form.loader = loader;
}
function generateIcon() {
  try {
    form.icon = makeIcon(color.value, glyph.value);
  } catch (e) {
    error.value = String(e);
  }
}
function randomize() {
  color.value = ICON_COLORS[Math.floor(Math.random() * ICON_COLORS.length)]!;
  glyph.value = ICON_GLYPHS[Math.floor(Math.random() * ICON_GLYPHS.length)]!;
  // A repeated random choice must still visibly change the current icon.
  const next = makeIcon(color.value, glyph.value);
  if (next === form.icon) {
    color.value =
      ICON_COLORS[(ICON_COLORS.indexOf(color.value) + 1) % ICON_COLORS.length]!;
  }
  generateIcon();
}
async function chooseUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const sequence = ++uploadSequence;
  iconBusy.value = true;
  error.value = "";
  try {
    const icon = await uploadIcon(file);
    if (!disposed && sequence === uploadSequence) form.icon = icon;
  } catch (e) {
    if (!disposed)
      error.value =
        e instanceof Error ? e.message : "Could not read this image.";
  } finally {
    if (!disposed && sequence === uploadSequence) iconBusy.value = false;
    input.value = "";
  }
}
async function save() {
  if (
    iconBusy.value ||
    resolvingLoader.value ||
    store.busy ||
    (loaderPolicy.value === "other" && loaderLoading.value)
  )
    return;
  if (
    form.loader !== "vanilla" &&
    loaderPolicy.value === "other" &&
    !customLoaderVersion.value
  ) {
    error.value =
      "Choose a loader version from the list, or select Stable or Latest.";
    return;
  }
  const input = {
    name: form.name.trim() || suggestedName.value,
    minecraftVersion: form.minecraftVersion,
    loader: form.loader,
    memoryMb: Number(form.memoryMb),
    icon: form.icon ?? null,
    loaderVersion:
      form.loader === "vanilla"
        ? null
        : loaderPolicy.value === "other"
          ? customLoaderVersion.value.trim()
          : loaderPolicy.value,
  };
  resolvingLoader.value = true;
  try {
    if (input.loader === "fabric") {
      input.loaderVersion = await resolveLoaderVersion(
        input.loader,
        input.minecraftVersion,
        input.loaderVersion ?? "stable",
      );
    }
    error.value = validateInput(input) ?? "";
    if (error.value) return;
    if (await store.save(input, edit ? props.instance?.id : undefined))
      emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    resolvingLoader.value = false;
  }
}
</script>
<template>
  <dialog
    ref="dialog"
    class="instance-dialog create-dialog"
    aria-labelledby="dialog-title"
    @cancel.prevent="
      !store.busy && !iconBusy && !resolvingLoader && emit('close')
    "
  >
    <header class="create-heading">
      <h2 id="dialog-title">
        {{
          edit
            ? "Edit instance"
            : duplicate
              ? "Copy instance settings"
              : "Create instance"
        }}
      </h2>
      <button
        type="button"
        class="create-close icon-button"
        aria-label="Close dialog"
        :disabled="store.busy || iconBusy || resolvingLoader"
        @click="emit('close')"
      >
        <X :size="19" />
      </button>
    </header>

    <div v-if="step === 'choose'" class="create-choice-body">
      <label class="create-search-label" for="create-search"
        >Already know what you want to play?</label
      >
      <div class="create-search">
        <Search :size="18" /><input
          id="create-search"
          disabled
          placeholder="Modpack search coming soon"
        />
      </div>
      <div class="create-divider"><span>or</span></div>
      <h3>Choose instance type</h3>
      <div class="create-options">
        <button
          ref="setupButton"
          type="button"
          class="create-option available"
          @click="customSetup"
        >
          <span class="create-option-icon"><Boxes :size="26" /></span>
          <span
            ><strong>Custom setup</strong
            ><small
              >Start fresh with your choice of loader and game version.</small
            ></span
          >
          <span class="option-arrow">→</span>
        </button>
        <button
          v-for="option in [
            {
              title: 'Start from a mod or modpack',
              description: 'Choose a project and use its latest version.',
              icon: Compass,
            },
            {
              title: 'Upload a modpack',
              description: 'Install a modpack from a file on your device.',
              icon: Upload,
            },
            {
              title: 'Import instance',
              description: 'Bring an instance from another launcher.',
              icon: PackageOpen,
            },
          ]"
          :key="option.title"
          type="button"
          class="create-option"
          disabled
        >
          <span class="create-option-icon"
            ><component :is="option.icon" :size="24"
          /></span>
          <span
            ><strong>{{ option.title }}</strong
            ><small>{{ option.description }}</small></span
          >
          <span class="coming-label">Soon</span>
        </button>
      </div>
      <p class="create-footnote">
        Your instances and settings stay on your device.
      </p>
    </div>

    <form v-else class="create-setup-body" @submit.prevent="save">
      <div class="setup-scroll">
        <fieldset
          :disabled="store.busy || iconBusy || resolvingLoader"
          class="setup-fields"
        >
          <div class="create-icon-row">
            <div class="create-icon-preview">
              <InstanceIcon
                :loader="form.loader"
                :icon="form.icon"
                seed="new-instance"
              />
            </div>
            <div class="create-icon-actions">
              <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="visually-hidden"
                tabindex="-1"
                aria-label="Upload instance icon"
                @change="chooseUpload"
              />
              <button
                type="button"
                class="icon-action"
                @click="fileInput?.click()"
              >
                <Upload :size="16" />{{ iconBusy ? "Reading…" : "Upload" }}
              </button>
              <button type="button" class="icon-action" @click="randomize">
                <Shuffle :size="16" />Randomize
              </button>
              <button
                type="button"
                class="icon-action"
                :class="{ active: customizing }"
                :aria-expanded="customizing"
                aria-controls="icon-customization"
                @click="customizing = !customizing"
              >
                <Palette :size="16" />Customize
              </button>
            </div>
            <span class="icon-help"
              >Make it yours.<small
                >PNG, JPEG or WebP<br />Up to 5 MB</small
              ></span
            >
          </div>
          <section
            v-if="customizing"
            id="icon-customization"
            class="icon-customizer"
            aria-label="Customize instance icon"
          >
            <div role="group" aria-label="Icon colour">
              <button
                v-for="swatch in ICON_COLORS"
                :key="swatch"
                type="button"
                class="icon-swatch"
                :style="{ background: swatch }"
                :aria-label="'Colour ' + swatch"
                :aria-pressed="color === swatch"
                @click="
                  color = swatch;
                  generateIcon();
                "
              >
                <Check v-if="color === swatch" :size="16" />
              </button>
            </div>
            <div role="group" aria-label="Icon shape">
              <button
                v-for="shape in ICON_GLYPHS.map((id) => ({
                  id,
                  name: id.charAt(0).toUpperCase() + id.slice(1),
                }))"
                :key="shape.id"
                type="button"
                class="icon-shape"
                :aria-label="shape.name + ' icon'"
                :aria-pressed="glyph === shape.id"
                @click="
                  glyph = shape.id;
                  generateIcon();
                "
              >
                <img
                  :src="makeIcon(color, shape.id)"
                  alt=""
                  width="26"
                  height="26"
                  style="border-radius: 5px"
                />
              </button>
            </div>
          </section>
          <label class="setup-field"
            >Name<input
              ref="nameInput"
              v-model="form.name"
              aria-label="Instance name"
              maxlength="80"
              :placeholder="suggestedName"
          /></label>
          <fieldset class="setup-loader-field">
            <legend>Loader</legend>
            <div class="setup-pills" role="group" aria-label="Mod loader">
              <button
                v-for="loader in LOADERS"
                :key="loader.id"
                type="button"
                :class="{ active: form.loader === loader.id }"
                :aria-pressed="form.loader === loader.id"
                @click="selectLoader(loader.id)"
              >
                <Check v-if="form.loader === loader.id" :size="15" />{{
                  loader.name
                }}
              </button>
            </div>
          </fieldset>
          <div class="setup-field">
            <div class="setup-label-row">
              <span>Game version</span>
            </div>
            <VersionPicker
              :model-value="versionChoice"
              label="Game version"
              :options="[
                ...availableVersions.map((version) => ({
                  value: version.id,
                  label: version.id,
                  detail:
                    version.type === 'release' || version.type === 'selected'
                      ? ''
                      : version.type.replace('_', ' '),
                })),
                { value: '__manual', label: 'Enter version manually…' },
              ]"
              :show-all="snapshots"
              all-label="Show all versions"
              :disabled="store.busy || iconBusy || resolvingLoader"
              @update:model-value="selectVersion"
              @toggle-all="snapshots = !snapshots"
            />
            <input
              v-if="manualVersion"
              v-model="form.minecraftVersion"
              aria-label="Minecraft version"
              required
              maxlength="40"
              placeholder="e.g. 1.21.1 or 24w14a"
            />
            <small v-if="versionsLoading">Loading Minecraft versions…</small>
            <small v-else-if="versionsError" class="version-warning"
              >{{ versionsError }}
              <button type="button" @click="loadVersions">Retry</button></small
            >
          </div>
          <fieldset v-if="form.loader !== 'vanilla'" class="setup-loader-field">
            <legend>Loader version</legend>
            <div class="setup-pills" role="group" aria-label="Loader version">
              <button
                v-for="policy in [
                  { id: 'stable', name: 'Stable' },
                  { id: 'latest', name: 'Latest' },
                  { id: 'other', name: 'Other' },
                ]"
                :key="policy.id"
                type="button"
                :class="{ active: loaderPolicy === policy.id }"
                :aria-pressed="loaderPolicy === policy.id"
                @click="loaderPolicy = policy.id"
              >
                <Check v-if="loaderPolicy === policy.id" :size="15" />{{
                  policy.name
                }}
              </button>
            </div>
            <div v-if="loaderPolicy === 'other'" class="custom-loader-version">
              <VersionPicker
                v-model="customLoaderVersion"
                label="Loader version number"
                :options="loaderOptions"
                :show-all="allLoaderVersions"
                :disabled="
                  loaderLoading || store.busy || iconBusy || resolvingLoader
                "
                :placeholder="
                  loaderLoading
                    ? 'Loading loader versions…'
                    : 'Select a loader version'
                "
                all-label="Show all versions"
                @toggle-all="allLoaderVersions = !allLoaderVersions"
              />
              <small v-if="loaderLoading" role="status"
                >Loading loader versions…</small
              >
              <small
                v-else-if="loaderError"
                class="version-warning"
                role="alert"
                >{{ loaderError }}
                <button type="button" @click="loadLoaderVersions">Retry</button>
              </small>
            </div>
            <small class="loader-policy-help"
              >Saved as a setup preference. Compatibility will be checked when
              installation is available.</small
            >
          </fieldset>
        </fieldset>
      </div>
      <p v-if="duplicate" class="create-footnote">
        Copies settings and the icon. Worlds and files are not copied.
      </p>
      <p v-if="error || store.saveError" class="inline-error" role="alert">
        {{ error || store.saveError }}
      </p>
      <footer class="create-actions">
        <button
          v-if="!props.instance"
          type="button"
          class="button secondary"
          :disabled="store.busy || iconBusy || resolvingLoader"
          @click="back"
        >
          <ArrowLeft :size="16" />Back
        </button>
        <button
          v-else
          type="button"
          class="button secondary"
          :disabled="store.busy || iconBusy || resolvingLoader"
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          class="button primary"
          :disabled="store.busy || iconBusy || resolvingLoader"
        >
          <Plus v-if="!edit && !store.busy" :size="16" />{{
            resolvingLoader
              ? "Selecting loader…"
              : store.busy
                ? "Saving…"
                : edit
                  ? "Save changes"
                  : "Create instance"
          }}
        </button>
      </footer>
    </form>
  </dialog>
</template>

<style src="./instance-dialog.css"></style>

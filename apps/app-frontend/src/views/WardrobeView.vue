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
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Plus, Pencil, Trash2, X, Upload, Check, RotateCcw } from "@lucide/vue";
import { useAccount } from "../stores/account";
import { useWardrobe } from "../stores/wardrobe";
import {
  useSkinLibrary,
  type SavedSkin,
  type SkinDraft,
} from "../stores/skin-library";
import SkinHead from "../components/SkinHead.vue";
import SkinModel from "../components/SkinModel.vue";
import CapePreview from "../components/CapePreview.vue";
import { desktop } from "../api";
const account = useAccount();
const wardrobe = useWardrobe();
const library = useSkinLibrary();
const accountId = computed(() => account.view.account?.minecraftId ?? "");
const selected = ref<string | null>(null);
const visibleCount = ref(24);
const visibleSkins = computed(() => library.skins.slice(0, visibleCount.value));
const dialog = ref<HTMLDialogElement>();
const nameField = ref<HTMLInputElement>();
const trigger = ref<HTMLElement | null>(null);
const editorOpen = ref(false);
const editingAccount = ref(false);
const localError = ref("");
const notice = ref("");
const applying = ref(false);
const picking = ref(false);
const dropActive = ref(false);
const fileInput = ref<HTMLInputElement>();
let unlisten: UnlistenFn | undefined;
let mounted = true;
let generation = 0;
const draft = reactive<SkinDraft>({
  id: null,
  name: "",
  image: "",
  variant: "classic",
  capeId: null,
});
const activeCape = computed(() =>
  wardrobe.profile?.capes.find((c) => c.active),
);
const chosen = computed(() =>
  library.skins.find((s) => s.id === selected.value),
);
const shown = computed(
  () =>
    chosen.value ?? {
      image: wardrobe.profile?.skin ?? null,
      variant: wardrobe.profile?.variant ?? "classic",
      capeId: activeCape.value?.id ?? null,
      name: account.label,
    },
);
const previewCape = computed(
  () =>
    wardrobe.profile?.capes.find((c) => c.id === shown.value.capeId)?.image ??
    null,
);
const draftCape = computed(
  () =>
    wardrobe.profile?.capes.find((c) => c.id === draft.capeId)?.image ?? null,
);
const locked = computed(() => applying.value || library.busy || picking.value);
function openEditor(skin?: SavedSkin, current = false, image?: string) {
  if (locked.value) return;
  trigger.value =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  editingAccount.value = current;
  Object.assign(
    draft,
    skin
      ? { ...skin }
      : {
          id: null,
          name: current ? "Current skin" : "New skin",
          image: image ?? (current ? (wardrobe.profile?.skin ?? "") : ""),
          variant: current
            ? (wardrobe.profile?.variant.toLowerCase() ?? "classic")
            : "classic",
          capeId: current ? (activeCape.value?.id ?? null) : null,
        },
  );
  localError.value = "";
  library.error = "";
  editorOpen.value = true;
  void nextTick(() => {
    dialog.value?.showModal();
    nameField.value?.focus();
  });
}
function closeEditor() {
  if (locked.value) return;
  dialog.value?.close();
  editorOpen.value = false;
  trigger.value?.focus();
}
async function pick() {
  if (locked.value) return;
  const ticket = generation;
  picking.value = true;
  localError.value = "";
  try {
    if (!desktop) {
      fileInput.value?.click();
      return;
    }
    const image = await invoke<string | null>("skin_pick_texture");
    if (image && ticket === generation && editorOpen.value) draft.image = image;
  } catch (e) {
    if (ticket === generation) localError.value = String(e);
  } finally {
    picking.value = false;
  }
}
async function fromFile(file: File) {
  if (file.size > 1024 * 1024) {
    localError.value = "Choose a PNG skin smaller than 1 MB.";
    return;
  }
  const ticket = generation;
  const reader = new FileReader();
  reader.onload = () => {
    if (ticket !== generation || !mounted) return;
    const image = String(reader.result);
    if (!image.startsWith("data:image/png;base64,")) {
      localError.value = "Choose a PNG skin.";
      return;
    }
    if (!editorOpen.value) openEditor(undefined, false, image);
    else draft.image = image;
  };
  reader.readAsDataURL(file);
}
function dropped(event: DragEvent) {
  event.preventDefault();
  dropActive.value = false;
  const files = event.dataTransfer?.files;
  if (files?.length === 1) void fromFile(files[0]!);
  else localError.value = "Drop one PNG skin at a time.";
}
async function save() {
  localError.value = "";
  notice.value = "";
  if (!draft.image) {
    localError.value = "Choose a skin texture first.";
    return;
  }
  if (await library.save({ ...draft })) {
    notice.value = "Skin saved to your local library.";
    closeEditor();
  }
}
async function apply(skin: Pick<SkinDraft, "image" | "variant" | "capeId">) {
  if (locked.value || wardrobe.busy || !account.view.verified) return;
  const id = accountId.value;
  const ticket = generation;
  applying.value = true;
  localError.value = "";
  notice.value = "";
  let failure = "";
  try {
    await invoke("wardrobe_apply", {
      image: skin.image,
      variant: skin.variant.toLowerCase(),
      capeId: skin.capeId,
      expectedId: id,
    });
  } catch (e) {
    failure = String(e);
  }
  if (ticket !== generation) return;
  // Refresh even after partial service failures: the skin and cape are separate requests.
  await wardrobe.load(id);
  applying.value = false;
  if (failure) localError.value = failure;
  else {
    notice.value =
      "Skin and cape updated. Rejoin or relaunch Minecraft to see the change.";
    selected.value = null;
    closeEditor();
  }
}
async function remove(skin: SavedSkin) {
  if (
    !window.confirm(
      `Remove “${skin.name}” from your saved skins? Your Minecraft appearance will not change.`,
    )
  )
    return;
  await library.remove(skin.id);
  if (selected.value === skin.id && !library.error) selected.value = null;
}
async function reset() {
  if (locked.value || wardrobe.busy) return;
  await wardrobe.change("resetSkin", accountId.value);
  selected.value = null;
}
function receiveDrop(payload: { image?: string; error?: string }) {
  if (locked.value) return;
  if (payload.error) {
    localError.value = payload.error;
    return;
  }
  if (payload.image) {
    if (editorOpen.value) draft.image = payload.image;
    else openEditor(undefined, false, payload.image);
  }
}
watch(accountId, () => {
  generation++;
  applying.value = false;
  dialog.value?.close();
  editorOpen.value = false;
  selected.value = null;
  localError.value = "";
  notice.value = "";
});
onMounted(async () => {
  void library.load();
  if (desktop) {
    try {
      const off = await listen<{ image?: string; error?: string }>(
        "skin-file-dropped",
        (event) => receiveDrop(event.payload),
      );
      if (mounted) unlisten = off;
      else off();
    } catch {
      /* File chooser remains available. */
    }
  }
});
onBeforeUnmount(() => {
  mounted = false;
  generation++;
  unlisten?.();
});
</script>
<template>
  <section class="page-heading">
    <div>
      <h1>Skin selector</h1>
      <p class="muted">Your Minecraft appearance, ready for your next world.</p>
    </div>
    <button
      class="button secondary"
      :disabled="wardrobe.busy || locked || !accountId || !desktop"
      @click="wardrobe.load(accountId)"
    >
      Refresh account
    </button>
  </section>
  <p v-if="!desktop" class="muted">
    Saved skins and account changes are available in the Windows desktop app.
  </p>
  <p v-else-if="!account.view.verified" class="muted">
    Connect your Minecraft Java account in Settings to apply skins. You can
    still organise your local library.
  </p>
  <p
    v-if="wardrobe.error || library.error || (!editorOpen && localError)"
    role="alert"
    class="inline-error"
  >
    {{ localError || library.error || wardrobe.error }}
  </p>
  <p v-if="notice" role="status" class="instance-feedback">{{ notice }}</p>
  <p v-if="applying" role="status" class="muted">
    Updating your Minecraft appearance…
  </p>
  <div class="skin-selector-layout">
    <aside class="skin-current">
      <div class="skin-current-identity">
        <span class="skin-small-head"><SkinHead /></span
        ><strong>{{ account.label }}</strong>
      </div>
      <h2>{{ chosen?.name ?? "Current appearance" }}</h2>
      <SkinModel
        :skin="shown.image"
        :variant="shown.variant"
        :cape="previewCape"
        interactive
        label="Current Minecraft skin preview"
      />
      <div class="skin-current-actions">
        <button
          v-if="chosen"
          class="button primary"
          :disabled="locked || wardrobe.busy || !account.view.verified"
          @click="apply(chosen)"
        >
          Use skin</button
        ><button
          class="button secondary"
          :disabled="locked || !shown.image"
          @click="openEditor(chosen, !chosen)"
        >
          <Pencil :size="15" />Edit skin</button
        ><button v-if="chosen" class="text-link" @click="selected = null">
          Show current account skin
        </button>
      </div>
    </aside>
    <div
      class="skin-collections"
      @dragover.prevent="dropActive = true"
      @dragleave="dropActive = false"
      @drop="dropped"
    >
      <details open class="saved-skin-section">
        <summary>
          <h2>Saved skins</h2>
          <span>{{ library.skins.length }}</span>
        </summary>
        <div class="saved-skin-tools">
          <button
            class="icon-button"
            aria-label="Refresh saved skins"
            :disabled="locked"
            @click="library.load"
          >
            <RotateCcw :size="15" />
          </button>
        </div>
        <div class="saved-skin-grid" :class="{ 'drop-active': dropActive }">
          <button
            class="skin-add-card"
            :disabled="locked || !desktop"
            @click="openEditor()"
          >
            <Plus :size="30" /><strong>Add skin</strong
            ><span>Choose a PNG or drag and drop</span>
          </button>
          <article
            v-for="skin in visibleSkins"
            :key="skin.id"
            class="saved-skin-card"
            :class="{ selected: selected === skin.id }"
          >
            <button
              class="skin-select-target"
              :aria-label="`Preview ${skin.name}`"
              :aria-pressed="selected === skin.id"
              @click="selected = skin.id"
            >
              <SkinModel
                :skin="skin.image"
                :variant="skin.variant"
                :cape="
                  wardrobe.profile?.capes.find((c) => c.id === skin.capeId)
                    ?.image ?? null
                "
                :label="`${skin.name} skin preview`"
              /><strong>{{ skin.name }}</strong
              ><Check
                v-if="selected === skin.id"
                :size="18"
                class="skin-selected-mark"
              />
            </button>
            <div class="skin-card-actions">
              <button
                class="button primary"
                :disabled="locked"
                :aria-label="`Edit ${skin.name}`"
                @click="openEditor(skin)"
              >
                <Pencil :size="14" />Edit</button
              ><button
                class="button secondary danger"
                :disabled="locked"
                :aria-label="`Remove ${skin.name}`"
                @click="remove(skin)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </article>
        </div>
        <button
          v-if="library.skins.length > visibleCount"
          class="button secondary"
          @click="visibleCount += 24"
        >
          Show more skins
        </button>
        <p class="muted skin-library-note">
          Saved on this computer in AzuriaLauncher\skins. Previewing a skin does
          not change your account.
        </p>
      </details>
      <section class="skin-default-section">
        <h2>Default appearance</h2>
        <p class="muted">
          Return to the Minecraft default skin assigned to your account.
        </p>
        <button
          class="button secondary"
          :disabled="locked || wardrobe.busy || !account.view.verified"
          @click="reset"
        >
          <RotateCcw :size="15" />Reset to Minecraft default
        </button>
      </section>
      <section class="skin-owned-capes">
        <h2>Owned capes</h2>
        <p class="muted">
          Choose a cape in the skin editor, or apply one directly below.
        </p>
        <div class="cape-grid">
          <button
            class="cape-card"
            :aria-pressed="!activeCape"
            :disabled="locked || wardrobe.busy || !account.view.verified"
            @click="wardrobe.change('hideCape', accountId)"
          >
            <span class="no-cape">∅</span><strong>No cape</strong></button
          ><button
            v-for="cape in wardrobe.profile?.capes"
            :key="cape.id"
            class="cape-card"
            :aria-pressed="cape.active"
            :disabled="locked || wardrobe.busy"
            @click="wardrobe.change('selectCape', accountId, cape.id)"
          >
            <CapePreview :image="cape.image" :name="cape.alias" /><strong>{{
              cape.alias
            }}</strong
            ><span v-if="cape.active">Equipped</span>
          </button>
        </div>
      </section>
    </div>
  </div>
  <input
    ref="fileInput"
    type="file"
    accept="image/png"
    hidden
    @change="
      (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) fromFile(f);
        (e.target as HTMLInputElement).value = '';
      }
    "
  />
  <dialog
    ref="dialog"
    class="skin-edit-dialog"
    aria-labelledby="skin-edit-title"
    @cancel.prevent="closeEditor"
    @close="editorOpen = false"
  >
    <header>
      <h2 id="skin-edit-title">
        {{
          editingAccount
            ? "Editing current skin"
            : draft.id
              ? "Editing skin"
              : "Add skin"
        }}
      </h2>
      <button
        class="icon-button"
        aria-label="Close skin editor"
        :disabled="locked"
        @click="closeEditor"
      >
        <X :size="20" />
      </button>
    </header>
    <div class="skin-edit-body">
      <div class="skin-edit-preview">
        <SkinModel
          :skin="draft.image || null"
          :variant="draft.variant"
          :cape="draftCape"
          interactive
          label="Skin editor preview"
        />
      </div>
      <div class="skin-edit-fields">
        <label
          >Skin name<input
            ref="nameField"
            v-model="draft.name"
            maxlength="48"
            :disabled="locked"
        /></label>
        <h3>Texture</h3>
        <button class="button secondary" :disabled="locked" @click="pick">
          <Upload :size="15" />{{
            draft.image ? "Replace texture" : "Choose texture"
          }}
        </button>
        <p class="muted">PNG · 64 × 64 or 64 × 32</p>
        <fieldset :disabled="locked">
          <legend>Arm style</legend>
          <label
            ><input
              v-model="draft.variant"
              type="radio"
              value="classic"
            />Classic</label
          ><label
            ><input
              v-model="draft.variant"
              type="radio"
              value="slim"
            />Slim</label
          >
        </fieldset>
        <h3>Cape</h3>
        <div class="skin-edit-capes">
          <button
            class="skin-cape-choice"
            :aria-pressed="!draft.capeId"
            :disabled="locked"
            @click="draft.capeId = null"
          >
            <span>∅</span>None</button
          ><button
            v-for="cape in wardrobe.profile?.capes"
            :key="cape.id"
            class="skin-cape-choice"
            :aria-pressed="draft.capeId === cape.id"
            :disabled="locked"
            @click="draft.capeId = cape.id"
          >
            <CapePreview :image="cape.image" :name="cape.alias" /><span>{{
              cape.alias
            }}</span>
          </button>
        </div>
        <p v-if="!wardrobe.profile?.capes.length" class="muted">
          Owned capes appear after account refresh.
        </p>
      </div>
    </div>
    <p
      v-if="localError || library.error"
      class="inline-error skin-editor-error"
      role="alert"
    >
      {{ localError || library.error }}
    </p>
    <footer>
      <button class="button secondary" :disabled="locked" @click="closeEditor">
        Cancel</button
      ><button
        class="button secondary"
        :disabled="locked || !draft.image || !desktop"
        @click="save"
      >
        Save skin</button
      ><button
        class="button primary"
        :disabled="
          locked || wardrobe.busy || !draft.image || !account.view.verified
        "
        @click="apply(draft)"
      >
        Apply to account
      </button>
    </footer>
  </dialog>
</template>
<style scoped>
.skin-selector-layout {
  display: grid;
  grid-template-columns: minmax(240px, 30%) minmax(0, 1fr);
  gap: 32px;
  margin-top: 26px;
}
.skin-current {
  position: sticky;
  top: 0;
  align-self: start;
  text-align: center;
  min-width: 0;
  padding: 22px 12px;
}
.skin-current-identity {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.skin-small-head {
  width: 32px;
  height: 32px;
}
.skin-current h2 {
  font-size: 14px;
  color: var(--muted);
  font-weight: 500;
}
.skin-current :deep(.skin-model-stage) {
  height: 390px;
}
.skin-current :deep(.skin-model-person) {
  scale: 2;
}
.skin-current-actions {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}
.skin-current-actions .text-link {
  font-size: 12px;
  background: none;
  border: 0;
}
.skin-collections {
  min-width: 0;
}
.saved-skin-section > summary {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 18px;
}
.saved-skin-section > summary:before {
  content: "⌄";
  font-size: 20px;
}
.saved-skin-section:not([open]) > summary:before {
  content: "›";
}
.saved-skin-section h2,
.skin-collections h2 {
  font-size: 18px;
  margin: 0;
}
.saved-skin-section > summary > span {
  font-size: 12px;
  color: var(--muted);
}
.saved-skin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.saved-skin-grid.drop-active {
  outline: 2px dashed var(--pink);
  outline-offset: 6px;
  border-radius: 12px;
}
.skin-add-card,
.saved-skin-card {
  height: 250px;
  border-radius: 14px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  overflow: hidden;
  position: relative;
}
.skin-add-card {
  border-style: dashed;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--text);
  padding: 18px;
  text-align: center;
}
.skin-add-card span {
  font-size: 12px;
  color: var(--muted);
}
.saved-skin-card.selected {
  border-color: var(--blue);
  box-shadow: 0 0 0 1px var(--blue);
}
.skin-select-target {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: center;
}
.skin-select-target :deep(.skin-model-stage) {
  height: 215px;
}
.skin-select-target :deep(.skin-model-person) {
  scale: 1.2;
}
.skin-select-target > strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 10px;
}
.skin-selected-mark {
  position: absolute;
  right: 12px;
  top: 12px;
  color: var(--blue);
}
.skin-card-actions {
  position: absolute;
  bottom: 44px;
  left: 10px;
  right: 10px;
  display: flex;
  gap: 7px;
  opacity: 0;
  pointer-events: none;
}
.skin-card-actions .button {
  padding: 7px 10px;
  font-size: 12px;
  min-height: 32px;
}
.saved-skin-card:hover .skin-card-actions,
.saved-skin-card:focus-within .skin-card-actions {
  opacity: 1;
  pointer-events: auto;
}
.skin-library-note {
  font-size: 12px;
  line-height: 1.7;
  margin: 16px 0;
}
.skin-default-section,
.skin-owned-capes {
  margin-top: 32px;
}
.skin-default-section p,
.skin-owned-capes > p {
  font-size: 12px;
  line-height: 1.7;
  margin: 10px 0 16px;
}
.cape-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.cape-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  min-height: 145px;
}
.cape-card[aria-pressed="true"] {
  border-color: var(--pink);
  background: var(--accent-wash);
}
.cape-card strong {
  font-size: 12px;
}
.cape-card > span {
  font-size: 11px;
  color: var(--muted);
}
.cape-card .no-cape {
  font-size: 46px;
}
.skin-edit-dialog {
  width: min(820px, calc(100vw - 48px));
  max-width: none;
  max-height: calc(100dvh - 48px);
  padding: 0;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: auto;
}
.skin-edit-dialog::backdrop {
  background: #080b13b8;
}
.skin-edit-dialog > header,
.skin-edit-dialog > footer {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-strong);
  background: var(--panel);
}
.skin-edit-dialog > header h2 {
  font-size: 20px;
  margin: 0;
}
.skin-edit-dialog > footer {
  justify-content: flex-end;
  border-bottom: 0;
  border-top: 1px solid var(--border-strong);
  flex-wrap: wrap;
}
.skin-edit-body {
  padding: 24px;
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(240px, 1fr);
  gap: 28px;
}
.skin-edit-preview :deep(.skin-model-stage) {
  height: 330px;
}
.skin-edit-preview :deep(.skin-model-person) {
  scale: 1.7;
}
.skin-edit-fields > label {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.skin-edit-fields > label > input {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--input);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
}
.skin-edit-fields h3 {
  font-size: 14px;
  margin: 22px 0 10px;
}
.skin-edit-fields p {
  font-size: 11px;
  line-height: 1.6;
  margin: 8px 0;
  color: var(--muted);
}
.skin-edit-fields fieldset {
  padding: 0;
  margin-top: 22px;
  border: 0;
  display: flex;
  gap: 16px;
}
.skin-edit-fields legend {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}
.skin-edit-fields fieldset label {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.skin-edit-fields input[type="radio"] {
  accent-color: var(--pink);
}
.skin-edit-capes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.skin-cape-choice {
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  padding: 8px;
  min-width: 65px;
  min-height: 90px;
  max-width: 100px;
  font-size: 11px;
}
.skin-cape-choice[aria-pressed="true"] {
  border-color: var(--pink);
  background: var(--accent-wash);
}
.skin-cape-choice :deep(.cape-stage) {
  width: 65px;
  height: 75px;
  scale: 0.75;
  margin: -10px;
}
.skin-cape-choice > span {
  margin: 5px 0;
}
.skin-editor-error {
  margin: 0 24px 18px;
}
@media (hover: none) {
  .skin-card-actions {
    opacity: 1;
    pointer-events: auto;
  }
}
@media (max-width: 1000px) {
  .skin-selector-layout {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 20px;
  }
  .saved-skin-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }
  .skin-current :deep(.skin-model-stage) {
    height: 330px;
  }
  .skin-current :deep(.skin-model-person) {
    scale: 1.6;
  }
}
</style>

<style scoped>
.saved-skin-tools {
  display: flex;
  justify-content: flex-end;
  margin: -12px 0 8px;
}
</style>

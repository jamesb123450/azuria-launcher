<script setup lang="ts">
import { ref, computed } from "vue";
import { Upload, Shuffle, RotateCcw } from "@lucide/vue";
import InstanceIcon from "./InstanceIcon.vue";
import {
  ICON_COLORS,
  ICON_GLYPHS,
  ICON_STYLES,
  makeIcon,
  uploadIcon,
  type IconGlyph,
  type IconStyle,
} from "../lib/instance-icons";
import type { Loader } from "../types";
defineProps<{ loader?: Loader; seed?: string }>();
const icon = defineModel<string | null>({ required: true });
const color = ref(ICON_COLORS[2]!);
const glyph = ref<IconGlyph>("cube");
const style = ref<IconStyle>("glow");
const busy = ref(false);
const error = ref("");
const input = ref<HTMLInputElement>();
const previews = computed(() =>
  ICON_GLYPHS.map((shape) => ({
    shape,
    src: makeIcon(color.value, shape, style.value),
  })),
);
function apply() {
  icon.value = makeIcon(color.value, glyph.value, style.value);
}
function randomize() {
  const old = icon.value;
  color.value = ICON_COLORS[Math.floor(Math.random() * ICON_COLORS.length)]!;
  glyph.value = ICON_GLYPHS[Math.floor(Math.random() * ICON_GLYPHS.length)]!;
  style.value = ICON_STYLES[Math.floor(Math.random() * ICON_STYLES.length)]!;
  apply();
  if (icon.value === old) {
    glyph.value =
      ICON_GLYPHS[(ICON_GLYPHS.indexOf(glyph.value) + 1) % ICON_GLYPHS.length]!;
    apply();
  }
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  busy.value = true;
  error.value = "";
  try {
    icon.value = await uploadIcon(file);
  } catch (e) {
    error.value = String(e);
  } finally {
    busy.value = false;
    if (input.value) input.value.value = "";
  }
}
</script>
<template>
  <section class="icon-studio" aria-label="Instance icon studio">
    <div class="icon-studio-preview">
      <InstanceIcon :icon="icon" :loader="loader" :seed="seed" />
      <div>
        <h3>Make it yours</h3>
        <p class="muted">Choose a symbol and finish, or use your own image.</p>
        <div class="instance-inline-actions">
          <button
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="input?.click()"
          >
            <Upload :size="15" />{{ busy ? "Reading…" : "Upload" }}</button
          ><button
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="randomize"
          >
            <Shuffle :size="15" />Randomize</button
          ><button
            type="button"
            class="icon-button"
            aria-label="Reset instance icon"
            @click="icon = null"
          >
            <RotateCcw :size="16" />
          </button>
        </div>
      </div>
      <input
        ref="input"
        type="file"
        class="visually-hidden"
        tabindex="-1"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload instance icon"
        @change="upload"
      />
    </div>
    <div class="studio-label">Symbol</div>
    <div class="icon-studio-symbols" role="group" aria-label="Icon symbol">
      <button
        v-for="preview in previews"
        :key="preview.shape"
        type="button"
        :aria-label="preview.shape + ' icon'"
        :aria-pressed="glyph === preview.shape"
        @click="
          glyph = preview.shape;
          apply();
        "
      >
        <img :src="preview.src" alt="" />
      </button>
    </div>
    <div class="studio-label">Palette</div>
    <div class="icon-studio-colors" role="group" aria-label="Icon palette">
      <button
        v-for="swatch in ICON_COLORS"
        :key="swatch"
        type="button"
        :style="{ background: swatch }"
        :aria-label="'Icon colour ' + swatch"
        :aria-pressed="color === swatch"
        @click="
          color = swatch;
          apply();
        "
      />
    </div>
    <div class="studio-label">Background</div>
    <div class="icon-studio-finishes" role="group" aria-label="Icon background">
      <button
        v-for="finish in ICON_STYLES"
        :key="finish"
        type="button"
        :aria-pressed="style === finish"
        @click="
          style = finish;
          apply();
        "
      >
        <img :src="makeIcon(color, glyph, finish)" alt="" /><span>{{
          finish
        }}</span>
      </button>
    </div>
    <p v-if="error" role="alert" class="inline-error">{{ error }}</p>
  </section>
</template>
<style scoped>
.icon-studio {
  padding: 20px;
  border: 1px solid var(--border-strong);
  background: var(--panel);
  border-radius: 12px;
}
.icon-studio-preview {
  display: flex;
  align-items: center;
  gap: 20px;
}
.icon-studio-preview > .instance-symbol {
  width: 86px;
  height: 86px;
  flex: none;
  border-radius: 20px;
}
.icon-studio-preview p {
  margin: 5px 0 12px;
}
.studio-label {
  font-size: 11px;
  color: var(--muted);
  margin: 20px 0 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.icon-studio-symbols,
.icon-studio-colors,
.icon-studio-finishes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.icon-studio-symbols button {
  padding: 3px;
  border: 2px solid transparent;
  background: transparent;
  border-radius: 12px;
}
.icon-studio-symbols img {
  display: block;
  width: 43px;
  height: 43px;
  border-radius: 8px;
}
.icon-studio button[aria-pressed="true"] {
  border-color: var(--pink);
  box-shadow: 0 0 0 2px var(--panel);
}
.icon-studio-colors button {
  width: 26px;
  height: 26px;
  border: 2px solid transparent;
  border-radius: 50%;
}
.icon-studio-colors button[aria-pressed="true"] {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}
.icon-studio-finishes button {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
  padding: 6px 10px 6px 6px;
  border-radius: 8px;
  font-size: 12px;
  text-transform: capitalize;
}
.icon-studio-finishes img {
  width: 28px;
  height: 28px;
  border-radius: 5px;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { skinBoxes, boxFaces } from "../lib/skin-model";
const props = withDefaults(
  defineProps<{
    skin: string | null;
    variant: string;
    cape?: string | null;
    interactive?: boolean;
    label?: string;
  }>(),
  { interactive: false, label: "Minecraft skin preview", cape: null },
);
const image = ref<string | null>(null);
const yaw = ref(-24);
const pitch = ref(-6);
let generation = 0;
let drag: {
  id: number;
  x: number;
  y: number;
  yaw: number;
  pitch: number;
} | null = null;
const boxes = computed(() => skinBoxes(props.variant.toLowerCase() === "slim"));
watch(
  () => props.skin,
  (skin) => {
    const token = ++generation;
    image.value = null;
    if (!skin) return;
    const texture = new Image();
    texture.onload = () => {
      if (
        token !== generation ||
        texture.width !== 64 ||
        ![32, 64].includes(texture.height)
      )
        return;
      if (texture.height === 64) {
        image.value = skin;
        return;
      }
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(texture, 0, 0);
      const copy = (
        x: number,
        y: number,
        w: number,
        h: number,
        dx: number,
        dy: number,
      ) => {
        ctx.save();
        ctx.translate(dx + w, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(texture, x, y, w, h, 0, 0, w, h);
        ctx.restore();
      };
      for (const [x, y, w, h, dx, dy] of [
        [4, 16, 4, 4, 20, 48],
        [8, 16, 4, 4, 24, 48],
        [8, 20, 4, 12, 16, 52],
        [4, 20, 4, 12, 20, 52],
        [0, 20, 4, 12, 24, 52],
        [12, 20, 4, 12, 28, 52],
        [44, 16, 4, 4, 36, 48],
        [48, 16, 4, 4, 40, 48],
        [48, 20, 4, 12, 32, 52],
        [44, 20, 4, 12, 36, 52],
        [40, 20, 4, 12, 40, 52],
        [52, 20, 4, 12, 44, 52],
      ])
        copy(x!, y!, w!, h!, dx!, dy!);
      image.value = c.toDataURL("image/png");
    };
    texture.src = skin;
  },
  { immediate: true },
);
function down(e: PointerEvent) {
  if (!props.interactive) return;
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    yaw: yaw.value,
    pitch: pitch.value,
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return;
  yaw.value = drag.yaw + (e.clientX - drag.x) * 0.7;
  pitch.value = Math.max(
    -35,
    Math.min(35, drag.pitch - (e.clientY - drag.y) * 0.3),
  );
}
function end() {
  drag = null;
}
onBeforeUnmount(() => generation++);
</script>
<template>
  <div
    class="skin-model-stage"
    :class="{ interactive }"
    :style="{
      '--skin-image': image ? `url('${image}')` : 'none',
      '--cape-image': cape ? `url('${cape}')` : 'none',
    }"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @lostpointercapture="end"
  >
    <div
      v-if="image"
      class="skin-model-person"
      role="img"
      :aria-label="label"
      :style="{ transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)` }"
    >
      <div
        v-for="box in boxes"
        :key="box.name"
        class="skin-model-box"
        :style="{
          transform: `translate3d(${box.x * 5}px,${(box.y - 16) * 5}px,${box.z * 5}px)`,
        }"
      >
        <span
          v-for="face in boxFaces(box)"
          :key="face.name"
          class="skin-model-face"
          :class="`skin-face-${face.name}`"
          :style="{
            width: `${(face.w + 2 * (box.inflate ?? 0)) * 5}px`,
            height: `${(face.h + 2 * (box.inflate ?? 0)) * 5}px`,
            backgroundSize: `${(320 * (face.w + 2 * (box.inflate ?? 0))) / face.w}px ${(320 * (face.h + 2 * (box.inflate ?? 0))) / face.h}px`,
            backgroundPosition: `-${(face.u * 5 * (face.w + 2 * (box.inflate ?? 0))) / face.w}px -${(face.v * 5 * (face.h + 2 * (box.inflate ?? 0))) / face.h}px`,
            transform: `translate(-50%,-50%) ${face.transform}`,
          }"
        />
      </div>
      <div v-if="cape" class="skin-model-cape" />
    </div>
    <span v-else class="skin-model-empty">{{
      skin ? "Loading preview…" : "Minecraft default appearance"
    }}</span>
  </div>
  <div v-if="interactive && image" class="skin-rotation">
    <span>Drag to rotate</span
    ><button type="button" aria-label="Rotate skin left" @click="yaw -= 45">
      ←</button
    ><button type="button" aria-label="Rotate skin right" @click="yaw += 45">
      →</button
    ><button
      type="button"
      aria-label="Reset skin rotation"
      @click="
        yaw = -24;
        pitch = -6;
      "
    >
      Reset view
    </button>
  </div>
</template>
<style scoped>
.skin-model-stage {
  height: 280px;
  display: grid;
  place-items: center;
  perspective: 750px;
  overflow: hidden;
  min-width: 0;
}
.skin-model-stage.interactive {
  touch-action: none;
  cursor: grab;
}
.skin-model-stage.interactive:active {
  cursor: grabbing;
}
.skin-model-person {
  position: relative;
  width: 80px;
  height: 160px;
  transform-style: preserve-3d;
}
.skin-model-box {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  transform-style: preserve-3d;
}
.skin-model-face {
  position: absolute;
  display: block;
  background-image: var(--skin-image);
  background-size: 320px 320px;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  backface-visibility: hidden;
}
.skin-model-cape {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 50px;
  height: 80px;
  background-image: var(--cape-image);
  background-size: 320px 160px;
  background-position: -5px -5px;
  image-rendering: pixelated;
  transform: translate(-50%, -50%) translate3d(0, -5px, -13px) rotateY(180deg)
    rotateX(-8deg);
  backface-visibility: visible;
}
.skin-face-left,
.skin-face-right {
  filter: brightness(0.8);
}
.skin-face-back {
  filter: brightness(0.85);
}
.skin-face-bottom {
  filter: brightness(0.65);
}
.skin-model-empty {
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  max-width: 150px;
}
.skin-rotation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 11px;
  margin-top: 6px;
}
.skin-rotation button {
  background: var(--panel-soft);
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  color: var(--text);
  padding: 4px 7px;
}
</style>

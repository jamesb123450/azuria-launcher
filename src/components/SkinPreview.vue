<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
const props = defineProps<{ skin: string | null; variant: string }>();
const canvas = ref<HTMLCanvasElement>();
let generation = 0;
watch(
  () => [props.skin, props.variant],
  async () => {
    const token = ++generation;
    await nextTick();
    const ctx = canvas.value?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 240);
    if (!props.skin) return;
    const image = new Image();
    image.onload = () => {
      if (
        token !== generation ||
        image.width !== 64 ||
        ![32, 64].includes(image.height)
      )
        return;
      ctx.imageSmoothingEnabled = false;
      const draw = (
        sx: number,
        sy: number,
        w: number,
        h: number,
        x: number,
        y: number,
      ) => ctx.drawImage(image, sx, sy, w, h, x, y, w * 6, h * 6);
      const slim = props.variant.toLowerCase() === "slim";
      const arm = slim ? 3 : 4;
      draw(8, 8, 8, 8, 56, 12);
      draw(20, 20, 8, 12, 56, 60);
      draw(44, 20, arm, 12, 56 - arm * 6, 60);
      draw(
        image.height === 64 ? 36 : 44,
        image.height === 64 ? 52 : 20,
        arm,
        12,
        104,
        60,
      );
      draw(4, 20, 4, 12, 56, 132);
      draw(
        image.height === 64 ? 20 : 4,
        image.height === 64 ? 52 : 20,
        4,
        12,
        80,
        132,
      );
      draw(40, 8, 8, 8, 56, 12);
      if (image.height === 64) {
        draw(20, 36, 8, 12, 56, 60);
        draw(44, 36, arm, 12, 56 - arm * 6, 60);
        draw(52, 52, arm, 12, 104, 60);
        draw(4, 36, 4, 12, 56, 132);
        draw(4, 52, 4, 12, 80, 132);
      }
    };
    image.src = props.skin;
  },
  { immediate: true },
);
onBeforeUnmount(() => generation++);
</script>
<template>
  <canvas
    ref="canvas"
    width="160"
    height="240"
    aria-label="Current Minecraft skin preview"
    role="img"
  />
</template>
<style scoped>
canvas {
  height: 210px;
  max-width: 100%;
  image-rendering: pixelated;
}
</style>

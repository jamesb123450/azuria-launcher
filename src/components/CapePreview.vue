<script setup lang="ts">
defineProps<{ image: string | null; name: string }>();
</script>
<template>
  <span class="cape-stage" role="img" :aria-label="`${name} cape preview`">
    <span
      v-if="image"
      class="cape-model"
      :style="{ '--cape-texture': `url('${image}')` }"
    >
      <span class="cape-face cape-front" />
      <span class="cape-face cape-back" />
      <span class="cape-face cape-edge" />
      <span class="cape-face cape-top" />
    </span>
    <span v-else class="cape-unavailable">Preview unavailable</span>
  </span>
</template>
<style scoped>
.cape-stage {
  width: 90px;
  height: 100px;
  display: grid;
  place-items: center;
  perspective: 400px;
}
.cape-model {
  position: relative;
  width: 50px;
  height: 80px;
  transform-style: preserve-3d;
  transform: rotateY(-24deg) rotateX(5deg) rotateZ(4deg);
}
.cape-face {
  position: absolute;
  display: block;
  background-image: var(--cape-texture);
  /* Minecraft's 64 × 32 atlas: ten-by-sixteen faces and one-pixel edges.
     Fixed atlas size also normalises higher-resolution cape textures. */
  background-size: 320px 160px;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  backface-visibility: hidden;
}
.cape-front {
  width: 50px;
  height: 80px;
  background-position: -5px -5px;
  transform: translateZ(2.5px);
}
.cape-back {
  width: 50px;
  height: 80px;
  background-position: -60px -5px;
  transform: rotateY(180deg) translateZ(2.5px);
}
.cape-edge {
  width: 5px;
  height: 80px;
  left: 22.5px;
  background-position: -55px -5px;
  transform: rotateY(90deg) translateZ(25px);
}
.cape-top {
  width: 50px;
  height: 5px;
  top: 37.5px;
  background-position: -5px 0;
  transform: rotateX(90deg) translateZ(40px);
}
.cape-unavailable {
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}
</style>

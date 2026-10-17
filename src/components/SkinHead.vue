<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import { UserRound } from "@lucide/vue";
import { useAccount } from "../stores/account";
import { useWardrobe } from "../stores/wardrobe";
const account = useAccount();
const wardrobe = useWardrobe();
const canvas = ref<HTMLCanvasElement>();
const drawn = ref(false);
let generation = 0;
watch(
  () => [account.view.account?.minecraftId, account.view.verified] as const,
  ([id, verified]) => {
    if (!verified || !id) {
      if (wardrobe.owner) wardrobe.reset();
      return;
    }
    if (wardrobe.owner !== id) {
      wardrobe.reset(id);
      void wardrobe.load(id);
    }
  },
  { immediate: true },
);
watch(
  () => wardrobe.profile?.skin,
  async (skin) => {
    const ticket = ++generation;
    drawn.value = false;
    if (!skin) return;
    await nextTick();
    const image = new Image();
    image.onload = () => {
      if (ticket !== generation || !canvas.value) return;
      const ctx = canvas.value.getContext("2d");
      if (!ctx || image.width !== 64 || ![32, 64].includes(image.height))
        return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 64, 64);
      ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 64, 64);
      drawn.value = true;
    };
    image.src = skin;
  },
  { immediate: true },
);
onBeforeUnmount(() => generation++);
</script>
<template>
  <span class="skin-head" aria-hidden="true"
    ><canvas v-show="drawn" ref="canvas" width="64" height="64" /><UserRound
      v-if="!drawn"
      :size="20"
  /></span>
</template>
<style scoped>
.skin-head {
  display: inline-grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 6px;
}
.skin-head canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import type { Loader } from "../types";
const props = defineProps<{
  loader?: Loader;
  seed?: string;
  icon?: string | null;
}>();
const palette = computed(() => {
  if (!props.seed) return props.loader === "fabric" ? 1 : 0;
  let hash = 0;
  for (const letter of props.seed)
    hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  return hash % 5;
});
</script>
<template>
  <span
    :class="['instance-symbol', loader ?? 'vanilla']"
    aria-hidden="true"
    :data-palette="palette"
    ><img v-if="icon" :src="icon" alt="" draggable="false" /><svg
      v-else
      viewBox="0 0 64 64"
      fill="none"
    >
      <path d="M32 7 55 20 32 34 9 20 32 7Z" fill="var(--cube-top)" />
      <path d="m9 20 23 14v25L9 45V20Z" fill="var(--cube-left)" />
      <path d="m32 34 23-14v25L32 59V34Z" fill="var(--cube-right)" />
      <path d="m9 20 23 14 23-14M32 34v25" stroke="#fff" stroke-opacity=".12" />
      <path
        d="m20 14 23 14M32 7v13l-12 7"
        stroke="#fff"
        stroke-opacity=".13"
      /></svg
  ></span>
</template>

<script setup lang="ts">
import type { Loader } from "../types";
defineProps<{ loader?: Loader }>();
</script>
<template>
  <span :class="['instance-symbol', loader ?? 'vanilla']" aria-hidden="true"
    ><svg viewBox="0 0 64 64" fill="none">
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

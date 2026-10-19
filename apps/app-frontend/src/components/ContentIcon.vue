<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Package } from "@lucide/vue";
import { contentImage } from "../lib/content-images";
const props = defineProps<{ url?: string | null; name?: string }>();
const failed = ref(false);
watch(
  () => props.url,
  () => (failed.value = false),
);
const image = computed(() => !failed.value && contentImage(props.url));
</script>
<template>
  <span class="content-icon"
    ><img
      v-if="image"
      :src="image"
      :alt="name ?? ''"
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true" /><Package v-else :size="26" aria-hidden="true"
  /></span>
</template>
<style scoped>
.content-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: var(--surface-raised, var(--surface));
  border: 1px solid var(--border);
  overflow: hidden;
}
.content-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>

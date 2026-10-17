<script setup lang="ts">
defineProps<{ type?: string }>();
</script>
<template>
  <span :class="['release-badge', type || 'release']">{{
    type === "alpha" ? "Alpha" : type === "beta" ? "Beta" : "Release"
  }}</span>
</template>
<style scoped>
.release-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--blue);
  background: var(--accent-wash);
}
.release-badge.beta {
  color: #d5a251;
  background: #d5a25115;
  border-color: #d5a25155;
}
.release-badge.alpha {
  color: #dc8bab;
  background: #dc8bab15;
  border-color: #dc8bab55;
}
</style>

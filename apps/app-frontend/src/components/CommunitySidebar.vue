<script setup lang="ts">
import { UsersRound, Sparkles } from "@lucide/vue";
defineProps<{ adsOnly?: boolean }>();
</script>
<template>
  <aside
    class="community-sidebar"
    :aria-label="adsOnly ? 'Advertisements' : 'Friends and advertisements'"
  >
    <section v-if="!adsOnly" class="friends-placeholder">
      <div class="friends-heading">
        <h2><UsersRound :size="17" />Friends</h2>
        <span>Coming soon</span>
      </div>
      <div class="friends-empty">
        <UsersRound :size="30" :stroke-width="1.3" />
        <p>Your next adventure, together.</p>
      </div>
    </section>
    <div class="community-ads">
      <section
        v-for="slot in 2"
        :key="slot"
        class="square-ad"
        role="region"
        :aria-label="`Advertisement slot ${slot}`"
      >
        <span>Advertisement</span
        ><Sparkles :size="24" :stroke-width="1" aria-hidden="true" />
      </section>
    </div>
  </aside>
</template>

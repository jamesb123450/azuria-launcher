<script setup lang="ts">
import { onMounted } from "vue";
import { useAzuriaAccount } from "../stores/azuria-account";
import { usePrivacy } from "../stores/privacy";
import { UsersRound, Sparkles } from "@lucide/vue";
defineProps<{ adsOnly?: boolean }>();
const account = useAzuriaAccount();
const privacy = usePrivacy();
onMounted(() => account.init());
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
        <RouterLink
          v-if="account.view.configured"
          to="/settings#account"
          class="azuria-account-link"
          >{{
            account.view.account
              ? privacy.options.hideAccount
                ? "Azuria account"
                : account.view.account.displayName || "Azuria account"
              : "Sign in to Azuria"
          }}</RouterLink
        >
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

<style scoped>
.azuria-account-link {
  font-size: 12px;
  color: var(--accent, #d7b0d1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>

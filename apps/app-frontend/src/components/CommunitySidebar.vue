<script setup lang="ts">
import { useFriends } from "../stores/friends";
import { useAzuriaAccount } from "../stores/azuria-account";
import { UsersRound, Sparkles, Plus, RefreshCw } from "@lucide/vue";
defineProps<{ adsOnly?: boolean }>();
import { useMessages } from "../stores/messages";
import { nextTick } from "vue";
import type { Relationship } from "../friends-api";
const messages = useMessages();
const friends = useFriends();
async function chat(row: Relationship) {
  friends.show("friends");
  await nextTick();
  messages.select(row);
}
const account = useAzuriaAccount();
</script>
<template>
  <aside
    class="community-sidebar"
    :aria-label="adsOnly ? 'Advertisements' : 'Friends and advertisements'"
  >
    <section v-if="!adsOnly" class="friends-placeholder">
      <div class="friends-heading">
        <h2>
          <UsersRound :size="17" />Friends
          <small v-if="friends.loaded">{{ friends.friends.length }}</small>
        </h2>
        <div v-if="friends.owner" class="friends-tools">
          <button
            class="icon-button"
            :disabled="friends.busy"
            aria-label="Refresh friends"
            @click="friends.refresh"
          >
            <RefreshCw :size="13" /></button
          ><button
            class="icon-button"
            aria-label="Add friend"
            @click="friends.show('add')"
          >
            <Plus :size="15" />
          </button>
        </div>
      </div>
      <div v-if="!friends.owner" class="friends-empty">
        <UsersRound :size="30" :stroke-width="1.3" />
        <p>Sign in to your Azuria account to add friends.</p>
        <RouterLink
          v-if="account.view.configured"
          to="/settings#account"
          class="azuria-account-link"
          >Sign in to Azuria</RouterLink
        >
      </div>
      <template v-else>
        <button
          v-if="friends.incoming.length"
          class="friends-request-link"
          @click="friends.show('requests')"
        >
          {{ friends.incoming.length }} friend
          {{ friends.incoming.length === 1 ? "request" : "requests" }}
        </button>
        <p v-if="friends.error" role="alert" class="friends-sidebar-error">
          {{ friends.error }}
        </p>
        <p
          v-if="friends.busy && !friends.loaded"
          class="friends-sidebar-note"
          role="status"
        >
          Loading friends…
        </p>
        <div
          v-if="friends.loaded && !friends.friends.length"
          class="friends-empty"
        >
          <UsersRound :size="28" :stroke-width="1.3" />
          <p>Add a friend to get started.</p>
          <button class="azuria-account-link" @click="friends.show('add')">
            Add friend
          </button>
        </div>
        <button
          v-for="row in friends.friends.slice(0, 6)"
          :key="row.account_id"
          class="sidebar-friend"
          @click="chat(row)"
        >
          <span class="sidebar-friend-avatar">{{
            row.display_name.slice(0, 1).toUpperCase()
          }}</span
          ><span
            ><strong>{{ row.display_name }}</strong
            ><small>@{{ row.username }}</small></span
          >
        </button>
        <button
          class="azuria-account-link manage-friends"
          @click="friends.show()"
        >
          Manage friends
        </button>
      </template>
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

.friends-tools {
  display: flex;
  gap: 3px;
}
.friends-heading small {
  color: var(--muted);
  font-size: 11px;
}
.friends-request-link {
  width: 100%;
  margin: 14px 0 8px;
  background: var(--hover);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px;
  cursor: pointer;
  font-size: 11px;
}
button.azuria-account-link {
  border: 0;
  background: none;
  cursor: pointer;
}
.sidebar-friend {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: none;
  border: 0;
  color: var(--text);
  padding: 10px 0;
  cursor: pointer;
}
.sidebar-friend-avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(140deg, #b686c233, #8babe033);
  flex-shrink: 0;
}
.sidebar-friend strong {
  display: block;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.sidebar-friend small {
  display: block;
  color: var(--muted);
  font-size: 10px;
  margin-top: 3px;
}
.friends-sidebar-error,
.friends-sidebar-note {
  font-size: 11px;
  line-height: 1.6;
  color: var(--muted);
}
.manage-friends {
  margin-top: 12px;
}
</style>

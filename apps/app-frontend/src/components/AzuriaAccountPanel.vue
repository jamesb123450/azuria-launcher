<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ShieldCheck, ExternalLink } from "@lucide/vue";
import { useAzuriaAccount } from "../stores/azuria-account";
import { usePrivacy } from "../stores/privacy";
const account = useAzuriaAccount();
const privacy = usePrivacy();
const code = ref("");
onMounted(() => account.init());
async function connect() {
  await account.complete(code.value);
  code.value = "";
}
</script>
<template>
  <section
    class="settings-panel azuria-account-panel"
    aria-labelledby="azuria-account-title"
  >
    <div class="settings-title">
      <ShieldCheck :size="22" />
      <div>
        <h2 id="azuria-account-title">Azuria account</h2>
        <p class="muted">Your account for Azuria Studios.</p>
      </div>
    </div>
    <p v-if="!account.ready" role="status">Loading account…</p>
    <template v-else>
      <p v-if="account.view.account" class="muted">
        {{
          privacy.options.hideAccount
            ? "Signed in to Azuria"
            : account.view.account.displayName ||
              account.view.account.username ||
              account.view.account.email
        }}
        <span
          v-if="!privacy.options.hideAccount && account.view.account.username"
        >
          · @{{ account.view.account.username }}</span
        >
      </p>
      <p v-else-if="!account.view.supported" class="muted">
        Azuria sign-in is available in the Windows desktop app.
      </p>
      <p v-else-if="!account.view.configured" class="muted">
        Azuria accounts are not available in this build yet. Minecraft sign-in
        is ready below.
      </p>
      <p v-else class="muted">
        Sign in or create an account in your browser. Minecraft accounts are
        managed separately below.
      </p>
      <p v-if="account.error" role="alert" class="inline-error">
        {{ account.error }}
      </p>
      <form
        v-if="account.pending"
        class="azuria-connect-form"
        @submit.prevent="connect"
      >
        <label
          >Connection code<input
            v-model="code"
            autocomplete="off"
            spellcheck="false"
            autocapitalize="none"
            maxlength="43"
            required
            placeholder="Paste the code from your browser"
        /></label>
        <p class="muted">
          Approve the connection in your browser, then paste its code here. The
          code expires after two minutes.
        </p>
        <div class="update-actions">
          <button
            class="button primary"
            :disabled="account.busy || code.trim().length !== 43"
          >
            Connect launcher</button
          ><button
            type="button"
            class="button secondary"
            :disabled="account.busy"
            @click="
              account.pending = false;
              code = '';
            "
          >
            Cancel
          </button>
        </div>
      </form>
      <div v-else class="update-actions">
        <button
          v-if="account.view.supported && account.view.configured"
          class="button primary"
          :disabled="account.busy"
          @click="account.begin"
        >
          {{
            account.view.account ? "Switch Azuria account" : "Sign in to Azuria"
          }}
        </button>
        <button
          v-if="account.view.account"
          class="button secondary"
          :disabled="account.busy"
          @click="account.manage"
        >
          Manage account <ExternalLink :size="14" />
        </button>
        <button
          v-if="account.view.account || account.error"
          class="button secondary"
          :disabled="account.busy"
          @click="account.signOut"
        >
          Sign out of Azuria
        </button>
        <button
          v-if="account.error"
          class="button secondary"
          :disabled="account.busy"
          @click="account.refresh"
        >
          Retry connection
        </button>
      </div>
      <p v-if="account.busy" class="muted" role="status">Connecting…</p>
    </template>
  </section>
</template>
<style scoped>
.azuria-account-panel {
  margin-bottom: 22px;
}
.azuria-connect-form {
  display: grid;
  gap: 12px;
  margin-top: 18px;
}
.azuria-connect-form label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.azuria-connect-form input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border, #ffffff22);
  border-radius: 10px;
  background: var(--input, #151622);
  color: inherit;
  font: inherit;
}
.azuria-connect-form p {
  margin: 0;
}
</style>

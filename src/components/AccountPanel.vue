<script setup lang="ts">
import { UserRound } from "@lucide/vue";
import { useAccount } from "../stores/account";
import type { AuthStage } from "../auth";
const account = useAccount();
const steps: Record<AuthStage, string> = {
  browser: "Continue in your browser to sign in to Microsoft…",
  microsoft: "Connecting to Microsoft…",
  xbox: "Verifying your Xbox account…",
  minecraft: "Connecting to Minecraft Services…",
  profile: "Checking Java Edition access and your Minecraft profile…",
  storage: "Updating secure account storage…",
  cancelled: "Sign-in cancelled.",
};
</script>
<template>
  <section id="account" class="settings-panel">
    <div class="settings-title">
      <UserRound :size="22" />
      <div>
        <h2>Minecraft account</h2>
        <p class="muted">{{ account.label }}</p>
      </div>
    </div>
    <p v-if="!account.ready" role="status">Loading account…</p>
    <p v-else-if="!account.view.supported" class="muted">
      Microsoft sign-in is available in the Windows desktop app.
    </p>
    <template v-else>
      <p v-if="account.view.account" class="muted">
        {{
          account.view.verified
            ? "Minecraft Java profile verified for this session."
            : "Saved account — reconnect to verify your current Minecraft access."
        }}
      </p>
      <p v-else class="muted">
        Sign in with the Microsoft account you use for Minecraft Java Edition.
        Your browser handles your Microsoft password.
      </p>
      <p v-if="account.busy && account.stage" role="status" aria-live="polite">
        {{ steps[account.stage] }}
      </p>
      <p v-if="account.error" role="alert" class="inline-error">
        {{ account.error }}
      </p>
      <div class="update-actions">
        <button
          class="button primary"
          :disabled="account.busy"
          @click="account.signIn"
        >
          {{
            account.view.account ? "Switch account" : "Sign in with Microsoft"
          }}
        </button>
        <button
          v-if="account.view.hasSavedSession && !account.view.verified"
          class="button secondary"
          :disabled="account.busy"
          @click="account.restore"
        >
          Reconnect
        </button>
        <button
          v-if="
            account.view.hasSavedSession ||
            account.view.account ||
            account.error
          "
          class="button secondary"
          :disabled="account.busy"
          @click="account.signOut"
        >
          Sign out & remove saved account
        </button>
        <button
          v-if="account.busy && account.stage !== 'storage'"
          class="button secondary"
          :disabled="account.cancelling"
          @click="account.cancel"
        >
          {{ account.cancelling ? "Cancelling…" : "Cancel sign-in" }}
        </button>
      </div>
      <p class="muted update-hint">
        Azuria remembers one account securely in Windows Credential Manager.
        Signing out removes it from Azuria; your browser may stay signed in to
        Microsoft. Game installation and launching are still in development.
      </p>
    </template>
  </section>
</template>

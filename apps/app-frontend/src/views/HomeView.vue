<script setup lang="ts">
import {
  Gamepad2,
  Shirt,
  ChevronRight,
  Settings,
  Newspaper,
  UserRound,
  LogIn,
} from "@lucide/vue";
import { useRouter } from "vue-router";
import QuickLaunch from "../components/QuickLaunch.vue";
import SkinHead from "../components/SkinHead.vue";
import { useAccount } from "../stores/account";
import { useLauncher } from "../stores/launcher";
import { desktop } from "../api";
const account = useAccount(),
  store = useLauncher(),
  router = useRouter();
function openAccount() {
  void router.push("/settings#account");
}
</script>
<template>
  <div class="home-page">
    <h1 class="home-welcome">Welcome to <strong>Azuria</strong></h1>
    <div class="home-layout">
      <div class="home-main">
        <section class="home-hero" aria-label="Launch Minecraft">
          <img
            class="home-scenery"
            src="/scenery/cherry-grove.webp"
            width="1024"
            height="1024"
            alt=""
          /><QuickLaunch /><RouterLink
            class="hero-settings"
            to="/settings#launch-defaults"
            aria-label="Launch settings"
            title="Launch settings"
            ><Settings :size="19"
          /></RouterLink>
        </section>
        <section class="home-news" aria-labelledby="home-news-heading">
          <h2 id="home-news-heading">Latest from Azuria</h2>
          <div class="news-coming-soon">
            <Newspaper :size="30" aria-hidden="true" />
            <h3>Coming soon</h3>
            <p>News and updates from Azuria Studios will appear here.</p>
          </div>
        </section>
        <details class="home-image-credit">
          <summary>Image credits</summary>
          <p>
            Minecraft scenery by
            <a
              href="https://modrinth.com/resourcepack/karbin-panoramas"
              target="_blank"
              rel="noopener noreferrer"
              >Karbin_Drem · Distant Shaded Panoramas</a
            >,
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              >CC BY-SA 4.0</a
            >. Converted to WebP, cropped and displayed with a contrast overlay.
            Not captured in Azuria.
          </p>
        </details>
        <div v-if="store.loadError" class="home-library-error" role="alert">
          <p>{{ store.loadError }}</p>
          <button class="button secondary" @click="store.init">
            Reload saved setups
          </button>
        </div>
      </div>
      <aside class="home-context" aria-label="Minecraft account and shortcuts">
        <section>
          <h2>Minecraft account</h2>
          <div class="home-account-card">
            <div class="home-account-portrait">
              <SkinHead v-if="account.view.account" /><UserRound
                v-else
                :size="46"
                :stroke-width="1"
              />
            </div>
            <h3>
              {{ account.view.account ? account.label : "Sign in to play" }}
            </h3>
            <p v-if="account.view.account">
              {{
                account.view.verified
                  ? "Minecraft Java Edition"
                  : "Reconnect to verify your account"
              }}
            </p>
            <button
              class="button secondary"
              :disabled="account.busy || !account.ready"
              @click="openAccount"
            >
              <LogIn v-if="!account.view.account" :size="16" />{{
                account.busy
                  ? "Connecting…"
                  : account.view.account
                    ? "Manage account"
                    : "Continue with Microsoft"
              }}
            </button>
          </div>
        </section>
        <section class="home-shortcuts">
          <h2>Quick access</h2>
          <RouterLink to="/versions"
            ><span><Gamepad2 :size="19" />Versions</span
            ><ChevronRight :size="16" /></RouterLink
          ><RouterLink to="/wardrobe"
            ><span><Shirt :size="19" />Skins &amp; capes</span
            ><ChevronRight :size="16"
          /></RouterLink>
        </section>
        <div class="home-ad" aria-label="Advertisement space">
          <span>Advertisement</span>
        </div>
        <p v-if="!desktop" class="home-preview-note">
          Interface preview. Microsoft sign-in and Minecraft launching require
          the Windows app.
        </p>
      </aside>
    </div>
  </div>
</template>

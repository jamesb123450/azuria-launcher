<script setup lang="ts">
import NewsFeed from "../components/NewsFeed.vue";
import HeroSettingsMenu from "../components/HeroSettingsMenu.vue";
import QuickLaunch from "../components/QuickLaunch.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import { useLauncher } from "../stores/launcher";
const store = useLauncher();
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
          /><QuickLaunch /><HeroSettingsMenu />
        </section>
        <NewsFeed />
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
      <CommunitySidebar />
    </div>
  </div>
</template>

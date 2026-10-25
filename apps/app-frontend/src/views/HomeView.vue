<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { Clock3, Settings, Plus, Compass, ArrowUpRight } from "@lucide/vue";
import NewsFeed from "../components/NewsFeed.vue";
import HeroSettingsMenu from "../components/HeroSettingsMenu.vue";
import LaunchControl from "../components/LaunchControl.vue";
import CommunitySidebar from "../components/CommunitySidebar.vue";
import SkinModel from "../components/SkinModel.vue";
import AccountMenu from "../components/AccountMenu.vue";
import InstanceIcon from "../components/InstanceIcon.vue";
import ContentIcon from "../components/ContentIcon.vue";
import { useLauncher } from "../stores/launcher";
import { useAccount } from "../stores/account";
import { useWardrobe } from "../stores/wardrobe";
import { usePrivacy } from "../stores/privacy";
import { useQuickPlay } from "../stores/quick-play";
import { useRecentPlay } from "../stores/recent-play";
import { contentApi } from "../content-api";
import { loaderName, type Instance } from "../types";
const store = useLauncher(),
  account = useAccount(),
  wardrobe = useWardrobe(),
  privacy = usePrivacy(),
  quick = useQuickPlay(),
  history = useRecentPlay();
const hasHistory = computed(() =>
  store.instances.some((i) => history.played[i.id]),
);
const profiles = computed(() =>
  [...store.instances]
    .sort(
      (a, b) =>
        (history.played[b.id] || 0) - (history.played[a.id] || 0) ||
        Number(b.favorite) - Number(a.favorite) ||
        b.createdAt - a.createdAt,
    )
    .slice(0, 3),
);
const playerSkin = computed(() =>
  !privacy.options.hideAccount &&
  account.view.verified &&
  wardrobe.owner === account.view.account?.minecraftId
    ? wardrobe.profile?.skin
    : null,
);
const cape = computed(() =>
  playerSkin.value
    ? wardrobe.profile?.capes.find((c) => c.active)?.image
    : null,
);
const packs = ref<Record<string, string | null>>({});
let generation = 0;
onBeforeUnmount(() => generation++);
watch(
  () => profiles.value.map((p) => p.id).join(","),
  async () => {
    const current = ++generation;
    try {
      const installed = await contentApi.installedPacks();
      const next: Record<string, string | null> = {};
      for (const p of installed.packs.filter((p) =>
        profiles.value.some((i) => i.id === p.instanceId),
      ))
        next[p.instanceId] = null;
      if (current !== generation) return;
      packs.value = next;
      await Promise.allSettled(
        installed.packs
          .filter((p) => p.instanceId in next)
          .map(async (p) => {
            const details = await contentApi.project(
              p.pack.provider,
              p.pack.projectId,
            );
            if (current === generation)
              packs.value[p.instanceId] = details.project.iconUrl ?? null;
          }),
      );
    } catch {
      /* Local profiles remain usable if provider metadata is unavailable. */
    }
  },
  { immediate: true },
);
function select(instance: Instance) {
  quick.adoptSetup(instance);
  store.selectedId = instance.id;
}
function played(id: string) {
  const time = history.played[id];
  return time
    ? `Played ${new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "Ready when you are";
}
</script>
<template>
  <div class="home-page player-home">
    <header class="player-home-heading">
      <div>
        <span class="home-eyebrow">YOUR NEXT WORLD</span>
        <h1 class="home-welcome">Welcome to <strong>Azuria</strong></h1>
      </div>
      <RouterLink class="text-link" to="/versions"
        >Explore versions <ArrowUpRight :size="14"
      /></RouterLink>
    </header>
    <div class="home-dashboard">
      <div class="home-primary">
        <section class="home-hero player-scene" aria-label="Launch Minecraft">
          <img
            class="home-scenery"
            src="/scenery/home-panorama.webp"
            width="1600"
            height="600"
            alt=""
          />
          <div class="player-scene-heading">
            <span>MINECRAFT JAVA EDITION</span>
            <h2>Make yourself at home.</h2>
          </div>
          <RouterLink
            class="hero-character"
            to="/wardrobe"
            aria-label="Open your Minecraft wardrobe"
          >
            <SkinModel
              :skin="playerSkin || '/appearance/steve.png'"
              :variant="
                playerSkin ? wardrobe.profile?.variant || 'classic' : 'classic'
              "
              :cape="cape"
              :label="
                playerSkin
                  ? 'Your Minecraft character'
                  : 'Default Steve appearance preview'
              "
            />
          </RouterLink>
          <div class="player-account">
            <AccountMenu hero /><small v-if="!playerSkin">{{
              privacy.options.hideAccount
                ? "Appearance hidden"
                : account.view.account
                  ? "Default appearance preview"
                  : "Sign in to use your skin"
            }}</small>
          </div>
          <HeroSettingsMenu />
        </section>
        <section class="home-profiles" aria-labelledby="home-profiles-heading">
          <div class="home-section-heading">
            <h2 id="home-profiles-heading">
              <Clock3 :size="16" />{{
                hasHistory ? "Recently played" : "Your profiles"
              }}
            </h2>
            <RouterLink to="/versions?tab=setups" class="text-link"
              >View all <ArrowUpRight :size="13"
            /></RouterLink>
          </div>
          <p v-if="store.loading" class="muted" role="status">
            Loading your profiles…
          </p>
          <div v-else-if="!store.libraryReady" class="home-profile-empty">
            <p>{{ store.loadError || "Your profiles could not be loaded." }}</p>
            <button class="button secondary" @click="store.init">
              Reload saved setups
            </button>
          </div>
          <div v-else-if="!profiles.length" class="home-profile-empty">
            <Compass :size="24" />
            <h3>Your next adventure starts here.</h3>
            <p>
              Choose a Minecraft version or discover a modpack to create your
              first profile.
            </p>
            <RouterLink class="button secondary" to="/versions"
              ><Plus :size="15" />Choose a version</RouterLink
            >
          </div>
          <article
            v-for="profile in profiles"
            :key="profile.id"
            class="home-profile-card"
            :class="{ selected: quick.setup?.id === profile.id }"
          >
            <button
              class="home-profile-select"
              :aria-label="`Select ${profile.name} for Home`"
              :disabled="
                quick.preparing ||
                !['vanilla', 'fabric'].includes(profile.loader)
              "
              @click="select(profile)"
            >
              <ContentIcon
                v-if="profile.id in packs"
                :url="packs[profile.id]"
                :name="profile.name"
              /><InstanceIcon
                v-else
                :icon="profile.icon"
                :loader="profile.loader"
                :seed="profile.id"
              />
              <span
                ><strong>{{ profile.name }}</strong
                ><small
                  >Minecraft {{ profile.minecraftVersion }} ·
                  {{ loaderName(profile.loader) }}</small
                ><small>{{ played(profile.id) }}</small></span
              >
            </button>
            <div class="home-profile-actions">
              <LaunchControl
                :instance="profile"
                monitor
                return-home
                compact-label
              /><RouterLink
                class="icon-button"
                :to="`/instances/${profile.id}?settings=general`"
                :aria-label="`Settings for ${profile.name}`"
                ><Settings :size="17"
              /></RouterLink>
            </div>
          </article>
        </section>
        <div class="home-bottom-actions">
          <RouterLink class="button secondary" to="/versions?tab=setups"
            >Manage profiles</RouterLink
          ><RouterLink class="button secondary" to="/discover"
            ><Plus :size="15" />Discover content</RouterLink
          >
        </div>
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
            Not captured in Azuria. Default Steve texture and Minecraft are by
            Mojang/Microsoft.
          </p>
        </details>
      </div>
      <aside class="home-secondary" aria-label="News and friends">
        <NewsFeed /><CommunitySidebar friends-only />
      </aside>
      <aside class="home-sponsor-rail" aria-label="Home advertisements">
        <div class="home-section-heading">
          <h2>Sponsors</h2>
          <span>Advertisement</span>
        </div>
        <CommunitySidebar ads-only />
      </aside>
    </div>
  </div>
</template>
<style scoped src="./home.css"></style>

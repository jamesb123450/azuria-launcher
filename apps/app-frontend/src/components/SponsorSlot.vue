<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { Sparkles } from "@lucide/vue";
import {
  useAdvertisements,
  sponsorImage,
  sponsorLink,
} from "../stores/advertisements";
import { invoke } from "@tauri-apps/api/core";
const props = defineProps<{ placement: string; number: number }>();
const sponsors = useAdvertisements();
const now = ref(Date.now()),
  failed = ref(false),
  error = ref("");
const ad = computed(() =>
  sponsors.ads.find(
    (a) =>
      a.slots.includes(props.placement) &&
      (!a.ends_at || Date.parse(a.ends_at) > now.value),
  ),
);
watch(
  () => ad.value?.id,
  () => {
    failed.value = false;
    error.value = "";
  },
);
async function open() {
  now.value = Date.now();
  if (!ad.value) return;
  const link = sponsorLink(ad.value.destination);
  if (!link) return;
  try {
    await invoke("content_open_url", { url: link });
  } catch {
    error.value = "Could not open the sponsor’s website. Try again.";
  }
}
let timer: ReturnType<typeof setInterval>;
let expiry: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry(end?: string | null) {
  clearTimeout(expiry);
  if (!end || !Number.isFinite(Date.parse(end))) return;
  expiry = setTimeout(
    () => {
      now.value = Date.now();
      if (now.value < Date.parse(end)) scheduleExpiry(end);
    },
    Math.min(2147483647, Math.max(1, Date.parse(end) - Date.now() + 1)),
  );
}
watch(() => ad.value?.ends_at, scheduleExpiry, { immediate: true });
function refresh() {
  now.value = Date.now();
  if (!document.hidden) void sponsors.load();
}
onMounted(() => {
  refresh();
  // One shared request per five minutes while visible; both slots share a cache.
  timer = setInterval(refresh, 300000);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(expiry);
  document.removeEventListener("visibilitychange", refresh);
  window.removeEventListener("focus", refresh);
});
</script>
<template>
  <section
    class="square-ad sponsor-slot"
    role="region"
    :aria-label="`Advertisement slot ${number}`"
    :data-ad-slot="placement"
  >
    <span>Advertisement</span>
    <button
      v-if="ad && !failed"
      class="sponsor-artwork"
      :aria-label="`Visit ${ad.title} (opens in browser)`"
      @click="open"
    >
      <img
        :src="sponsorImage(sponsors.url, ad.image_path)"
        :alt="ad.image_alt"
        referrerpolicy="no-referrer"
        @error="failed = true"
      />
    </button>
    <svg
      v-else
      class="ad-placeholder-image"
      width="600"
      height="600"
      viewBox="0 0 600 600"
      role="img"
      aria-label="600 by 600 advertisement placeholder"
    >
      <rect
        x="200"
        y="210"
        width="200"
        height="150"
        rx="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        opacity=".18"
      />
      <path
        d="m220 340 55-55 40 35 35-25 30 45"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        opacity=".18"
      />
      <circle cx="350" cy="250" r="12" fill="currentColor" opacity=".18" />
      <text
        x="300"
        y="410"
        text-anchor="middle"
        fill="currentColor"
        font-size="22"
        letter-spacing="3"
        opacity=".45"
      >
        600 × 600
      </text>
    </svg>
    <p v-if="error" role="alert" class="sponsor-error">{{ error }}</p>
  </section>
</template>
<style scoped>
.sponsor-slot {
  position: relative;
  overflow: hidden;
}
.sponsor-artwork {
  position: absolute;
  inset: 24px 8px 8px;
  width: calc(100% - 16px);
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.sponsor-artwork img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sponsor-artwork:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: -2px;
}
.sponsor-error {
  position: absolute;
  bottom: 0;
  padding: 8px;
  background: var(--panel);
  font-size: 11px;
}
</style>

<style scoped>
.ad-placeholder-image {
  width: 100%;
  height: 100%;
  max-width: 600px;
  max-height: 600px;
  color: var(--muted);
}
</style>

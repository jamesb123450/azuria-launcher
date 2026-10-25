import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
export interface SponsorAd {
  id: string;
  title: string;
  image_path: string;
  image_alt: string;
  destination: string;
  slots: string[];
  ends_at: string | null;
}
export function sponsorLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function sponsorImage(base: string, path: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(path)) return "";
  try {
    const url = new URL(base);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".supabase.co") ||
      url.username ||
      url.password ||
      url.port
    )
      return "";
    return `${url.origin}/storage/v1/object/public/sponsor-images/${path}`;
  } catch {
    return "";
  }
}
export const useAdvertisements = defineStore("advertisements", () => {
  const ads = ref<SponsorAd[]>([]),
    url = ref("");
  let pending: Promise<void> | undefined,
    fetched = 0;
  async function load() {
    if (pending) return pending;
    if (Date.now() - fetched < 60000 || !isTauri()) return;
    fetched = Date.now();
    pending = (async () => {
      try {
        const feed = await invoke<{ url: string; ads: SponsorAd[] }>(
          "azuria_advertisements",
        );
        url.value = feed.url;
        ads.value = feed.ads
          .slice(0, 8)
          .filter(
            (ad) =>
              sponsorLink(ad.destination) &&
              sponsorImage(feed.url, ad.image_path),
          );
      } catch {
        ads.value = [];
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }
  return { ads, url, load };
});

import { invoke, isTauri } from "@tauri-apps/api/core";
export interface NewsStory {
  slug: string;
  title: string;
  summary: string;
  cover_path: string;
  cover_alt: string;
  image_position: string;
  published_at: string;
}
export interface NewsFeed {
  url: string;
  stories: NewsStory[];
}
export const newsApi = {
  load: (): Promise<NewsFeed> =>
    isTauri()
      ? invoke("azuria_news")
      : Promise.resolve({ url: "", stories: [] }),
};
export function storyURL(slug: string) {
  return `https://launcher.azuriasmp.org/news/?story=${encodeURIComponent(slug)}`;
}
export function coverURL(base: string, path: string) {
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
    return `${url.origin}/storage/v1/object/public/news-images/${path}`;
  } catch {
    return "";
  }
}

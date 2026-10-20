import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => api);
import { newsApi, coverURL, storyURL } from "../../src/news-api";
beforeEach(() => vi.resetAllMocks());
it("loads public news through its fixed native command without an account token", async () => {
  api.isTauri.mockReturnValue(true);
  api.invoke.mockResolvedValue({
    url: "https://example.supabase.co",
    stories: [],
  });
  await newsApi.load();
  expect(api.invoke).toHaveBeenCalledExactlyOnceWith("azuria_news");
});
it("browser previews show an empty state without making authenticated requests", async () => {
  api.isTauri.mockReturnValue(false);
  expect(await newsApi.load()).toEqual({ url: "", stories: [] });
  expect(api.invoke).not.toHaveBeenCalled();
});
it("only generates HTTPS news links and Supabase cover URLs", () => {
  const path =
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
  expect(coverURL("https://example.supabase.co", path)).toBe(
    `https://example.supabase.co/storage/v1/object/public/news-images/${path}`,
  );
  expect(coverURL("https://evil.test", path)).toBe("");
  expect(coverURL("https://example.supabase.co", "../image.svg")).toBe("");
  const link = new URL(storyURL("hello&admin=true"));
  expect(link.origin).toBe("https://launcher.azuriasmp.org");
  expect(link.searchParams.get("story")).toBe("hello&admin=true");
  expect(link.searchParams.has("admin")).toBe(false);
});

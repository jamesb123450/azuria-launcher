import { expect, it } from "vitest";
import { sponsorImage, sponsorLink } from "../../src/stores/advertisements";
it("accepts only HTTPS sponsor destinations without embedded credentials or custom ports", () => {
  expect(sponsorLink("https://example.com/offer?a=1")).toBe(
    "https://example.com/offer?a=1",
  );
  for (const link of [
    "javascript:alert(1)",
    "file:///secret",
    "http://example.com",
    "https://u:p@example.com",
    "https://example.com:8080",
  ])
    expect(sponsorLink(link)).toBe("");
});
it("artwork stays in the sponsor bucket with immutable raster paths", () => {
  const path =
    "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
  expect(sponsorImage("https://test.supabase.co", path)).toBe(
    `https://test.supabase.co/storage/v1/object/public/sponsor-images/${path}`,
  );
  for (const bad of [
    "../secret.png",
    path.replace(".png", ".svg"),
    "https://example.com/a.png",
  ])
    expect(sponsorImage("https://test.supabase.co", bad)).toBe("");
  expect(sponsorImage("https://evil.test", path)).toBe("");
});

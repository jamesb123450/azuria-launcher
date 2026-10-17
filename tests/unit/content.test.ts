import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../src/api", () => ({ desktop: false }));
import { contentApi, type Search } from "../../src/content-api";
const query: Search = {
  provider: "modrinth",
  kind: "mods",
  query: "sodium",
  gameVersion: "1.21.1",
  loader: "fabric",
  category: "optimization",
  sort: "downloads",
  offset: 6,
  limit: 6,
};
beforeEach(() => vi.restoreAllMocks());
it("sends real provider search, pagination and compatibility filters", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        total_hits: 1,
        hits: [
          {
            project_id: "project",
            title: "Sodium",
            description: "Rendering",
            author: "Author",
            slug: "sodium",
            downloads: 12,
            categories: ["optimization"],
          },
        ],
      }),
    ),
  );
  const result = await contentApi.search(query);
  const url = new URL(String(fetch.mock.calls[0]![0]));
  expect(url.hostname).toBe("api.modrinth.com");
  expect(url.searchParams.get("offset")).toBe("6");
  expect(JSON.parse(url.searchParams.get("facets")!)).toContainEqual([
    "versions:1.21.1",
  ]);
  expect(result.projects[0]!.name).toBe("Sodium");
});
it("never exposes or asks the browser to send a CurseForge key", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(
    contentApi.search({ ...query, provider: "curseforge" }),
  ).rejects.toThrow("Windows");
  expect(fetch).not.toHaveBeenCalled();
});
it("represents datapacks as Modrinth mod projects with the datapack category", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ total_hits: 0, hits: [] })),
    );
  await contentApi.search({
    ...query,
    kind: "datapacks",
    loader: "",
    category: "",
  });
  const url = new URL(String(fetch.mock.calls[0]![0]));
  expect(JSON.parse(url.searchParams.get("facets")!)).toContainEqual([
    "categories:datapack",
  ]);
});

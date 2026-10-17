import { describe, expect, it, vi } from "vitest";
import {
  loaderEndpoint,
  parseLoaderVersions,
  resolveLoaderVersion,
} from "../../src/lib/loader-versions";
const xml = (versions: string[]) =>
  `<metadata><versioning><versions>${versions.map((version) => `<version>${version}</version>`).join("")}</versions></versioning></metadata>`;
describe("loader catalogues", () => {
  it("sorts and deduplicates Fabric and Quilt versions", () => {
    const text = JSON.stringify([
      { loader: { version: "0.9.0", stable: true } },
      { loader: { version: "0.10.0", stable: true } },
      { loader: { version: "0.10.0", stable: true } },
      { loader: { version: "0.11.0-beta.1", stable: false } },
    ]);
    for (const loader of ["fabric", "quilt"] as const) {
      expect(parseLoaderVersions(loader, "1.21.1", text)).toEqual([
        { id: "0.11.0-beta.1", stable: false },
        { id: "0.10.0", stable: true },
        { id: "0.9.0", stable: true },
      ]);
    }
  });
  it("filters Forge versions to the selected game without confusing neighbouring versions", () => {
    expect(
      parseLoaderVersions(
        "forge",
        "1.20.1",
        xml([
          "1.20.1-47.2.0",
          "1.20.1-47.3.0",
          "1.20.10-99.0.0",
          "1.21.1-52.0.0",
        ]),
      ),
    ).toEqual([
      { id: "47.3.0", stable: true },
      { id: "47.2.0", stable: true },
    ]);
  });
  it("maps NeoForge game versions and handles the legacy 1.20.1 repository", () => {
    expect(
      parseLoaderVersions(
        "neoforge",
        "1.21.1",
        xml(["21.1.10", "21.1.100-beta", "21.10.1"]),
      ),
    ).toEqual([
      { id: "21.1.100-beta", stable: false },
      { id: "21.1.10", stable: true },
    ]);
    expect(
      parseLoaderVersions("neoforge", "1.21", xml(["21.0.10"])),
    ).toHaveLength(1);
    expect(
      parseLoaderVersions("neoforge", "26.3", xml(["26.3.10"])),
    ).toHaveLength(1);
    expect(
      parseLoaderVersions("neoforge", "1.20.1", xml(["1.20.1-47.1.0"])),
    ).toEqual([{ id: "47.1.0", stable: true }]);
  });
  it("rejects invalid catalogues and unsafe versions", () => {
    expect(() =>
      parseLoaderVersions("forge", "1.21.1", "<html>error</html>"),
    ).toThrow();
    expect(() => parseLoaderVersions("fabric", "1.21.1", "{}")).toThrow();
    expect(
      parseLoaderVersions(
        "fabric",
        "1.21.1",
        '[{"loader":{"version":"../escape"}}]',
      ),
    ).toEqual([]);
    expect(() => loaderEndpoint("fabric", "../escape")).toThrow();
    expect(() => loaderEndpoint("vanilla", "1.21.1")).toThrow();
  });
});

it("keeps explicit loader versions pinned without requesting metadata", async () => {
  expect(await resolveLoaderVersion("fabric", "26.1", "0.19.5")).toBe("0.19.5");
  await expect(
    resolveLoaderVersion("fabric", "26.1", "../bad"),
  ).rejects.toThrow();
});

it("resolves stable and latest to concrete catalogue versions", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify([
          { loader: { version: "0.20.0", stable: false } },
          { loader: { version: "0.19.5", stable: true } },
        ]),
      ),
    );
  try {
    expect(await resolveLoaderVersion("fabric", "26.1", "stable")).toBe(
      "0.19.5",
    );
    expect(await resolveLoaderVersion("fabric", "26.1", "latest")).toBe(
      "0.20.0",
    );
  } finally {
    fetch.mockRestore();
  }
});

import { expect, it } from "vitest";
// @ts-expect-error Node release helper has no TypeScript declarations.
import { nextVersion, releaseNotes } from "../../scripts/release-host.mjs";
it("increments published release versions once regardless of workflow run counts", () => {
  expect(nextVersion(["v0.2.244", "v0.2.241"])).toBe("0.2.245");
  expect(nextVersion(["v0.2.150", "v0.2.145"])).toBe("0.2.151");
  expect(nextVersion([])).toBe("0.2.1");
  expect(() => nextVersion(["v0.3.1"])).toThrow();
  expect(() => nextVersion(["v0.2.65535"])).toThrow();
});
it("notes describe only the supplied unpublished range and omit merge boilerplate", () => {
  const item = (message: string, parents = 1) => ({
    commit: { message },
    parents: Array(parents).fill({}),
  });
  const text = releaseNotes([
    item("Keep sign-in on this device"),
    item("Simplify version controls\n\nInternal details"),
    item("Keep sign-in on this device"),
    item("Merge pull request #84", 2),
  ]);
  expect(text).toBe(
    "## What's new\n\n- Keep sign-in on this device\n- Simplify version controls\n",
  );
  expect(() => releaseNotes([])).toThrow();
});

it("uses explicit release bullets without publishing internal commit details", () => {
  expect(
    releaseNotes([
      {
        commit: {
          message:
            "Internal implementation title\n\nRelease notes:\n- Keep sign-in on this device.\n- Simplify version controls.\n\nPrivate implementation details",
        },
        parents: [{}],
      },
    ]),
  ).toBe(
    "## What's new\n\n- Keep sign-in on this device.\n- Simplify version controls.\n",
  );
});

it("configures public targets without exposing the source commit", async () => {
  const { vi } = await import("vitest");
  const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  // @ts-expect-error Node release helper has no TypeScript declarations.
  const { configure } = await import("../../scripts/release-host.mjs");
  const folder = mkdtempSync(join(tmpdir(), "azuria-release-test-"));
  const previous = process.cwd();
  vi.stubEnv("GITHUB_REPOSITORY", "jamesb123450/azuria-launcher");
  vi.stubEnv("AZURIA_RELEASES_TOKEN", "test-public-token");
  vi.stubEnv("GITHUB_TOKEN", "test-source-token");
  vi.stubEnv("GITHUB_RUN_NUMBER", "900");
  vi.stubEnv("GITHUB_SHA", "c".repeat(40));
  vi.stubEnv("AZURIA_RELEASE_BEFORE", "b".repeat(40));
  vi.stubEnv("GITHUB_ENV", join(folder, "env"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace("https://api.github.com/", "");
      let body: unknown;
      if (path.includes("/compare/"))
        body = {
          status: "ahead",
          commits: [
            {
              commit: { message: "Keep sign-in on this device" },
              parents: [{}],
            },
          ],
        };
      else if (path.includes("git/ref/"))
        body = { object: { sha: "a".repeat(40) } };
      else if (path.endsWith("/releases/latest"))
        body = { tag_name: "v0.2.150" };
      else
        body = {
          private: path.endsWith("azuria-launcher"),
          default_branch: "main",
        };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  try {
    process.chdir(folder);
    await configure();
    const env = readFileSync(join(folder, "env"), "utf8");
    expect(env).toContain("AZURIA_RELEASE_VERSION=0.2.151");
    expect(env).toContain("AZURIA_PUBLIC_RELEASE_TARGET=" + "a".repeat(40));
    expect(env).toContain("AZURIA_LEGACY_PUBLISH=false");
    expect(
      readFileSync(join(folder, "release-notes.generated.md"), "utf8"),
    ).toContain("Keep sign-in on this device");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/compare/v0.2.150..." + "c".repeat(40)),
      expect.anything(),
    );
    expect(env).not.toContain("test-public-token");
  } finally {
    process.chdir(previous);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(folder, { recursive: true, force: true });
  }
});

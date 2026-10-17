import { expect, it } from "vitest";
// @ts-expect-error Node release helper has no TypeScript declarations.
import { nextVersion } from "../../scripts/release-host.mjs";
it("continues numbering across both repositories", () => {
  expect(nextVersion("140", ["v0.2.139", "v0.2.138"])).toBe("0.2.140");
  expect(nextVersion("1", ["v0.2.150", "v0.2.145"])).toBe("0.2.151");
  expect(nextVersion("141", [])).toBe("0.2.141");
  expect(() => nextVersion("1", ["v0.3.1"])).toThrow();
  expect(() => nextVersion("70000", [])).toThrow();
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
  vi.stubEnv("GITHUB_RUN_NUMBER", "1");
  vi.stubEnv("GITHUB_ENV", join(folder, "env"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace("https://api.github.com/", "");
      let body: unknown;
      if (path.includes("git/ref/")) body = { object: { sha: "a".repeat(40) } };
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
    expect(env).not.toContain("test-public-token");
  } finally {
    process.chdir(previous);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(folder, { recursive: true, force: true });
  }
});

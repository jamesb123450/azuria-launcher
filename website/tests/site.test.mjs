import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, releaseNotes, safeReleaseURL } from "../src/pages.mjs";
import { affectsLauncher } from "../../.github/scripts/release-scope.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const base = "/azuria-launcher/";
const files = [
  "index.html",
  "downloads/index.html",
  "changelog/index.html",
  "help/index.html",
  "404.html",
];

test("all built pages have metadata, navigation and resolvable local links and fragments", async () => {
  for (const filename of files) {
    const html = await readFile(resolve(root, filename), "utf8");
    assert.match(html, /<html lang="en-GB">/);
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /<meta name="description"/);
    assert.equal(
      [...html.matchAll(/<h1[ >]/g)].length,
      1,
      filename + " should have one primary heading",
    );
    assert.match(html, /<main id="main" tabindex="-1">/);
    assert.match(html, /Skip to content/);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, "IDs must be unique");
    for (const [, target] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (target.startsWith("https://")) {
        assert.doesNotMatch(target, /undefined|null|javascript:/);
        continue;
      }
      if (target.startsWith("#")) {
        assert.ok(ids.includes(target.slice(1)), `${filename}: ${target}`);
        continue;
      }
      assert.ok(
        target.startsWith(base),
        `URL should support the project-site base: ${target}`,
      );
      const [path, fragment] = target.slice(base.length).split("#");
      const destination = resolve(
        root,
        path.endsWith("/") || !path ? path + "index.html" : path,
      );
      assert.ok(destination.startsWith(root));
      assert.ok((await stat(destination)).isFile(), target);
      if (fragment)
        assert.match(
          await readFile(destination, "utf8"),
          new RegExp(`id="${fragment}"`),
        );
    }
  }
});

test("downloads use this repository’s published installer and disclose development limits", async () => {
  const html = await readFile(resolve(root, "downloads/index.html"), "utf8");
  assert.match(
    html,
    /https:\/\/github.com\/jamesb123450\/azuria-launcher\/releases\/download\/v[\d.]+\/Azuria-Launcher_[\d.]+_x64-setup\.exe/,
  );
  assert.match(html, /Game installation and launching aren’t available yet/);
  assert.match(html, /not Authenticode signed/);
});

test("raw release HTML is escaped and unexpected download origins are rejected", () => {
  assert.equal(safeReleaseURL("https://evil.test/installer.exe", true), false);
  assert.equal(safeReleaseURL("javascript:alert(1)"), false);
  assert.equal(
    safeReleaseURL("https://github.com/other/project/releases/latest"),
    false,
  );
  const notes = releaseNotes(
    "## Changes\n\n- <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>",
  );
  assert.ok(!notes.includes("<script>") && !notes.includes("<img"));
  assert.match(notes, /&lt;script&gt;/);
  const html = render("downloads", {
    siteURL: "https://example.test/azuria-launcher/",
    base,
    releases: [
      {
        tag: "v1.0.0",
        url: "https://evil.test",
        installer: "javascript:alert(1)",
        published: "2026-10-16T00:00:00Z",
        notes: "",
      },
    ],
  });
  assert.ok(
    !html.includes('href="javascript:') &&
      !html.includes('href="https://evil.test'),
  );
});

test("website-only changes never request a new launcher release", () => {
  assert.equal(
    affectsLauncher([
      "website/src/pages.mjs",
      "website/data/releases.json",
      ".github/workflows/website.yml",
      "docs/WEBSITE.md",
      "README.md",
      ".gitignore",
      ".github/workflows/checks.yml",
      ".github/scripts/release-scope.mjs",
    ]),
    false,
  );
  assert.equal(affectsLauncher(["src/App.vue", "website/src/pages.mjs"]), true);
  assert.equal(affectsLauncher(["docs/RELEASE_NOTES.md"]), true);
  assert.equal(affectsLauncher(["unknown-config-file"]), true);
  assert.equal(affectsLauncher([]), false);
});

test("site contains no remote scripts, account form, analytics or unsupported platform downloads", async () => {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.doesNotMatch(
    html,
    /<form|Google Analytics|Download for macOS|Download for Linux/,
  );
  assert.match(html, /projects and statistics shown are fictional/);
  assert.match(html, /data-preview-image=/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, releaseNotes, safeReleaseURL } from "../src/pages.mjs";
import { parseRelease, releaseSummary } from "../src/release-data.mjs";
import { affectsLauncher } from "../../.github/scripts/release-scope.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const base = "/azuria-launcher/";
const files = [
  "index.html",
  "downloads/index.html",
  "changelog/index.html",
  "help/index.html",
  "privacy/index.html",
  "terms/index.html",
  "contact/index.html",
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

test("downloads resolve the latest release rather than a stale versioned installer", async () => {
  const html = await readFile(resolve(root, "downloads/index.html"), "utf8");
  assert.match(
    html,
    /href="https:\/\/github.com\/jamesb123450\/azuria-launcher\/releases\/latest"/,
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
  assert.doesNotMatch(
    html,
    /discover\.png|placeholder|Lorem ipsum|Coming soon/i,
  );
  assert.match(html, /data-latest-notice/);
  assert.match(html, /data-preview-image=/);
});

test("release metadata accepts only published releases and assets from this repository", () => {
  const release = {
    tag_name: "v0.2.100",
    html_url:
      "https://github.com/jamesb123450/azuria-launcher/releases/tag/v0.2.100",
    published_at: "2026-10-16T12:00:00Z",
    body: "## Changes\n\n- Real release information",
    assets: [
      {
        name: "Azuria-Launcher_0.2.100_x64-setup.exe",
        browser_download_url: "https://evil.test/download.exe",
      },
    ],
  };
  assert.equal(parseRelease(release).tag, "v0.2.100");
  assert.equal(parseRelease(release).installer, null);
  const installer =
    "https://github.com/jamesb123450/azuria-launcher/releases/download/v0.2.100/Azuria-Launcher_0.2.100_x64-setup.exe";
  assert.equal(
    parseRelease({
      ...release,
      assets: [{ ...release.assets[0], browser_download_url: installer }],
    }).installer,
    installer,
  );
  assert.equal(
    releaseSummary(parseRelease(release).notes),
    "Real release information",
  );
  for (const invalid of [
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, html_url: "https://evil.test" },
    { ...release, published_at: "not a date" },
    { ...release, tag_name: "<script>" },
    null,
  ])
    assert.equal(parseRelease(invalid), null);
});

test("public policies, contact route and real screenshot credit are present", async () => {
  const privacy = await readFile(resolve(root, "privacy/index.html"), "utf8");
  const terms = await readFile(resolve(root, "terms/index.html"), "utf8");
  const contact = await readFile(resolve(root, "contact/index.html"), "utf8");
  assert.match(privacy, /GitHub’s public API/);
  assert.match(privacy, /Windows Credential Manager/);
  assert.match(terms.replace(/\s+/g, " "), /applicable consumer rights/);
  assert.match(contact, /issues\/new/);
  assert.doesNotMatch(contact, /<form|<input|<textarea/);
  assert.match(
    contact.replace(/\s+/g, " "),
    /does not collect or send messages/,
  );
  const home = await readFile(resolve(root, "index.html"), "utf8");
  assert.match(home, /minecraft-cherry-grove\.webp/);
  assert.match(home, /CC BY-SA 4.0/);
  assert.match(home.replace(/\s+/g, " "), /Not captured in Azuria/);
  const css = await readFile(resolve(root, "site.css"), "utf8");
  assert.match(css, /assets\/minecraft-cherry-grove\.webp/);
  for (const [, asset] of css.matchAll(
    /url\(["']?(\.\/assets\/[^"')]+)["']?\)/g,
  ))
    assert.ok((await stat(resolve(root, asset))).isFile(), asset);
});

test("panorama assets are packaged and unsupported WebGL keeps the static fallback", async () => {
  const { mountPanorama } = await import("../src/panorama.js");
  await mountPanorama({ getContext: () => null });
  for (let index = 0; index < 6; index++) {
    assert.ok(
      (await stat(resolve(root, `assets/panorama-${index}.webp`))).size > 1000,
    );
  }
  const html = await readFile(resolve(root, "index.html"), "utf8");
  assert.match(
    html,
    /data-panorama-base="\/azuria-launcher\/assets\/panorama-"/,
  );
  assert.doesNotMatch(html, /explore-sidebar/);
  assert.ok(
    html.indexOf('class="hero-shot"') < html.indexOf('class="section-intro"'),
  );
});

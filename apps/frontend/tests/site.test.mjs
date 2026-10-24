import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, releaseNotes, safeReleaseURL } from "../src/pages.mjs";
import {
  parseRelease,
  releaseSummary,
  releaseRepository,
  legacyRepository,
} from "../src/release-data.mjs";
import { affectsLauncher } from "../../../.github/scripts/release-scope.mjs";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const base = "/azuria-releases/";
const files = [
  "index.html",
  "downloads/index.html",
  "changelog/index.html",
  "news/index.html",
  "help/index.html",
  "privacy/index.html",
  "cookie-policy/index.html",
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
      if (target.startsWith("mailto:")) {
        assert.match(target, /^mailto:privacy@azuriasmp\.org/);
        continue;
      }
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
  const releases = JSON.parse(
    await readFile(new URL("../data/releases.json", import.meta.url), "utf8"),
  );
  const host = releases[0]?.url?.startsWith(`${legacyRepository}/releases/`)
    ? legacyRepository
    : releaseRepository;
  assert.ok(
    html.includes(`href="${host}/releases/latest"`),
    "Download must resolve latest on the active public release host",
  );
  assert.match(html, /Vanilla and Fabric launching/);
  assert.match(html, /not Authenticode signed/);
});

test("downloads follow the public release host and retain the legacy transition fallback", () => {
  for (const host of [releaseRepository, legacyRepository]) {
    const html = render("downloads", {
      siteURL: "https://example.test/azuria-releases/",
      base,
      releases: [
        {
          tag: "v0.2.140",
          version: "0.2.140",
          url: `${host}/releases/tag/v0.2.140`,
          published: "2026-10-17T20:00:00Z",
          notes: "- Update",
          installer: `${host}/releases/download/v0.2.140/Azuria-Launcher_0.2.140_x64-setup.exe`,
          size: 1024,
        },
      ],
    });
    assert.ok(html.includes(`href="${host}/releases/latest"`));
    assert.ok(
      !html.includes('href="' + host + "/releases/download/"),
      "Primary download links must not pin an old installer",
    );
    if (host === releaseRepository)
      assert.ok(
        !html.includes(`href="${legacyRepository}/releases/latest"`),
        "Public releases must not send downloads to the source repository",
      );
  }
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
      "apps/frontend/src/pages.mjs",
      "apps/frontend/data/releases.json",
      ".github/workflows/website.yml",
      "docs/WEBSITE.md",
      "docs/ARCHITECTURE.md",
      "docs/previews/play-dark.webp",
      "README.md",
      ".gitignore",
      ".github/workflows/checks.yml",
      ".github/scripts/release-scope.mjs",
    ]),
    false,
  );
  assert.equal(
    affectsLauncher([
      "apps/app-frontend/src/App.vue",
      "apps/frontend/src/pages.mjs",
    ]),
    true,
  );
  assert.equal(affectsLauncher(["apps/app/docs/RELEASE_NOTES.md"]), true);
  assert.equal(affectsLauncher(["unknown-config-file"]), false);
  assert.equal(affectsLauncher([]), false);
});

test("default build contains no remote tags, account forms or unsupported platform downloads", async () => {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  if (process.env.AZURIA_ADSENSE_ENABLED === "true") {
    assert.match(html, /aria-label="Advertisement"/);
    for (const match of html.matchAll(/<script[^>]+src=["'](https?:[^"']+)/g))
      assert.equal(new URL(match[1]).hostname, "pagead2.googlesyndication.com");
  } else assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  assert.doesNotMatch(
    html,
    /<form|Google Analytics|Download for macOS|Download for Linux/,
  );
  assert.doesNotMatch(html, /discover\.png|Lorem ipsum/i);
  // Published release summaries may legitimately describe a removed placeholder.
  const productCopy = html.split(/<section\s+id="updates"/)[0];
  assert.doesNotMatch(productCopy, /placeholder|Coming soon/i);
  assert.match(html, /data-latest-notice/);
  assert.match(html, /data-preview-image=/);
});

test("release metadata accepts only published releases and assets from this repository", () => {
  const release = {
    tag_name: "v0.2.100",
    html_url:
      "https://github.com/jamesb123450/azuria-releases/releases/tag/v0.2.100",
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
    "https://github.com/jamesb123450/azuria-releases/releases/download/v0.2.100/Azuria-Launcher_0.2.100_x64-setup.exe";
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
  const privacy = (
    await readFile(resolve(root, "privacy/index.html"), "utf8")
  ).replace(/\s+/g, " ");
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

test("the homepage packages its active static scenery", async () => {
  assert.ok(
    (await stat(resolve(root, "assets/minecraft-cherry-grove.webp"))).size >
      1000,
  );
  const html = await readFile(resolve(root, "index.html"), "utf8");
  assert.match(html, /class="premium-scenery"/);
  assert.doesNotMatch(html, /<canvas|data-panorama-base/);
  assert.doesNotMatch(html, /explore-sidebar/);
  assert.ok(
    html.indexOf('class="hero-shot"') < html.indexOf('class="section-intro"'),
  );
});

test("product pages describe current features and use refreshed captures", async () => {
  const home = await readFile(resolve(root, "index.html"), "utf8");
  for (const image of [
    "versions.jpg",
    "home.jpg",
    "home-light.jpg",
    "create.jpg",
    "skins.jpg",
    "settings.jpg",
    "instance.jpg",
  ]) {
    assert.ok(home.includes(image), image);
    assert.ok((await stat(resolve(root, "assets", image))).size > 1000);
  }
  assert.match(home, /Save your changes/);
  for (const file of [
    "index.html",
    "downloads/index.html",
    "help/index.html",
    "terms/index.html",
  ]) {
    const html = (await readFile(resolve(root, file), "utf8")).replace(
      /\s+/g,
      " ",
    );
    assert.doesNotMatch(
      html,
      /launching aren’t available yet|approval (?:is currently )?pending|Check for updates|not installed yet/,
    );
  }
});

test("launcher policies expose cookie information, GDPR rights and dated terms", async () => {
  const privacy = await readFile(resolve(root, "privacy/index.html"), "utf8");
  const terms = await readFile(resolve(root, "terms/index.html"), "utf8");
  const cookies = await readFile(
    resolve(root, "cookie-policy/index.html"),
    "utf8",
  );
  const contact = await readFile(resolve(root, "contact/index.html"), "utf8");
  assert.match(privacy, /GDPR and UK GDPR/);
  assert.match(terms, /<time datetime="2026-10-24">24 October 2026<\/time>/);
  assert.match(cookies, /<h1>Cookie policy<\/h1>/);
  assert.match(contact, /mailto:privacy@azuriasmp.org/);
});

test("launcher search metadata identifies the primary domain and supports verification and previews", async () => {
  const releases = JSON.parse(
    await readFile(new URL("../data/releases.json", import.meta.url), "utf8"),
  );
  const html = render("home", {
    siteURL: "https://jamesb123450.github.io/azuria-releases/",
    canonicalSiteURL: "https://launcher.azuriasmp.org/",
    base,
    releases,
    verification: "test_token",
  });
  assert.match(
    html,
    /rel="canonical" href="https:\/\/launcher.azuriasmp.org\//,
  );
  assert.match(html, /og:site_name" content="Azuria Launcher/);
  assert.match(html, /name="twitter:title"/);
  assert.match(html, /google-site-verification" content="test_token/);
  const preview = render("home", {
    siteURL: "https://launcher.azuriasmp.org/",
    base: "/",
    releases,
    preview: true,
  });
  assert.match(preview, /noindex, nofollow/);
  const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/launcher.azuriasmp.org\/downloads\//);
  assert.doesNotMatch(sitemap, /404|github.io/);
});

import { mkdir, readFile, cp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { advertisingMarkup } from "../src/advertising.mjs";
import { render } from "../src/pages.mjs";
const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const siteURL =
  process.env.AZURIA_SITE_URL ||
  "https://jamesb123450.github.io/azuria-releases/";
const url = new URL(siteURL);
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.search ||
  url.hash
)
  throw new Error("Use an HTTPS site URL");
if (!url.pathname.endsWith("/")) url.pathname += "/";
const adSnippet = await readFile(new URL("src/adsense.html", root), "utf8");
const adsense = advertisingMarkup(adSnippet, {
  enabled: process.env.AZURIA_ADSENSE_ENABLED === "true",
  consentReady: process.env.AZURIA_ADSENSE_CMP_READY === "true",
});
const releases = JSON.parse(
  await readFile(new URL("data/releases.json", root), "utf8"),
);
if (!Array.isArray(releases) || !releases.length)
  throw new Error("Release metadata is missing");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(new URL("assets/", root), new URL("assets/", dist), {
  recursive: true,
});
for (const filename of [
  "site.css",
  "premium.css",
  "motion.mjs",
  "site.js",
  "release-data.mjs",
  "panorama.js",
])
  await cp(new URL(`src/${filename}`, root), new URL(filename, dist));
for (const page of [
  "home",
  "downloads",
  "changelog",
  "help",
  "privacy",
  "terms",
  "contact",
  "404",
]) {
  const path =
    page === "home"
      ? "index.html"
      : page === "404"
        ? "404.html"
        : `${page}/index.html`;
  const destination = new URL(path, dist);
  await mkdir(new URL("./", destination), { recursive: true });
  await writeFile(
    destination,
    render(page, { siteURL: url.href, base: url.pathname, releases, adsense }),
  );
}
await writeFile(new URL(".nojekyll", dist), "");
await writeFile(
  new URL("robots.txt", dist),
  `User-agent: *\nAllow: /\nSitemap: ${url.href}sitemap.xml\n`,
);
await writeFile(
  new URL("sitemap.xml", dist),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "downloads/", "changelog/", "help/", "privacy/", "terms/", "contact/"].map((path) => `<url><loc>${url.href}${path}</loc></url>`).join("")}</urlset>`,
);
console.log(`Built 7 pages and a 404 page in ${fileURLToPath(dist)}`);

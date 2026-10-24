import { mkdir, readFile, cp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { advertisingMarkup } from "../src/advertising.mjs";
import { render } from "../src/pages.mjs";
import { analyticsMarkup } from "../src/analytics.mjs";
analyticsMarkup({ id: process.env.AZURIA_GA_MEASUREMENT_ID });
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
  "analytics.js",
  "analytics.css",
  "site.css",
  "premium.css",
  "motion.mjs",
  "site.js",
  "news.js",
  "news-model.mjs",
  "news.css",
  "release-data.mjs",
])
  await cp(new URL(`src/${filename}`, root), new URL(filename, dist));
for (const page of [
  "home",
  "downloads",
  "changelog",
  "news",
  "help",
  "privacy",
  "cookie-policy",
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
    render(page, {
      siteURL: url.href,
      base: url.pathname,
      releases,
      adsense,
      analyticsEnabled: Boolean(process.env.AZURIA_GA_MEASUREMENT_ID?.trim()),
    }).replace(
      "</body>",
      analyticsMarkup({
        id: process.env.AZURIA_GA_MEASUREMENT_ID,
        base: url.pathname,
      }) + "</body>",
    ),
  );
}
await writeFile(new URL(".nojekyll", dist), "");
await writeFile(
  new URL("robots.txt", dist),
  `User-agent: *\nAllow: /\nSitemap: ${url.href}sitemap.xml\n`,
);
await writeFile(
  new URL("sitemap.xml", dist),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "downloads/", "changelog/", "news/", "help/", "privacy/", "cookie-policy/", "terms/", "contact/"].map((path) => `<url><loc>${url.href}${path}</loc></url>`).join("")}</urlset>`,
);
console.log(`Built 8 pages and a 404 page in ${fileURLToPath(dist)}`);

const newsURL = process.env.AZURIA_SUPABASE_URL?.trim();
const newsKey = process.env.AZURIA_SUPABASE_PUBLISHABLE_KEY?.trim();
if (Boolean(newsURL) !== Boolean(newsKey))
  throw new Error("Set both public Supabase news variables");
if (newsURL) {
  const parsed = new URL(newsURL);
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".supabase.co") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !newsKey.startsWith("sb_publishable_")
  )
    throw new Error(
      "Use your Supabase project URL and publishable key for news",
    );
}
await writeFile(
  new URL("news-config.json", dist),
  JSON.stringify({
    url: newsURL?.replace(/\/$/, "") || "",
    key: newsKey || "",
  }),
);

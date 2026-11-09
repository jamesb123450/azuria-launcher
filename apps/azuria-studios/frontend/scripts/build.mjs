import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  privacy,
  terms,
  contactPage,
  dataRequest,
  cookiePolicy,
} from "../src/legal.mjs";
import { studioSEO } from "../src/seo.mjs";
import { analyticsMarkup } from "../src/analytics.mjs";
const analytics = analyticsMarkup({
  id: process.env.AZURIA_GA_MEASUREMENT_ID,
  site: "studios",
});
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}dist`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const home = await readFile(`${root}src/home.html`, "utf8");
const banner = analytics;
const siteOrigin =
  process.env.AZURIA_SITE_URL?.trim() || "https://www.azuriasmp.org/";
const verification = process.env.AZURIA_GOOGLE_SITE_VERIFICATION?.trim() || "";
const preview = Boolean(
  process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production",
);
const render = (title, body, description, path = "") =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${description}"><meta name="theme-color" content="#101116"><title>${title}</title>${studioSEO({ title, description, path, origin: siteOrigin, verification, preview })}<link rel="icon" href="/assets/azuria.png"><script src="/theme.js"></script><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/analytics.css"><script src="/site.js" defer></script></head><body><a class="skip-link" href="#as-top">Skip to content</a>${body.replace(/<\/div>\s*$/, `${banner}</div>`)}</body></html>`;
await writeFile(
  `${output}/index.html`,
  render(
    "Azuria Studios — Gaming & Software Projects",
    home,
    "Meet Azuria Studios and Azuria Launcher for Windows: Minecraft Java, mods, modpacks, friends and encrypted messaging. Explore our projects and what comes next.",
  ),
);
for (const [slug, content, title] of [
  ["privacy", privacy, "Privacy policy"],
  ["terms", terms, "Terms of service"],
  ["contact", contactPage, "Contact"],
  ["data-request", dataRequest, "Data requests"],
  ["cookie-policy", cookiePolicy, "Cookie policy"],
]) {
  await mkdir(`${output}/${slug}`, { recursive: true });
  const body = home.replace(
    /<main id="as-top">[\s\S]*?<\/main>/,
    `<main id="as-top" class="legal-page">${content}</main>`,
  );
  await writeFile(
    `${output}/${slug}/index.html`,
    render(
      `${title} — Azuria Studios`,
      body,
      `${title} for the Azuria Studios website.`,
      `${slug}/`,
    ),
  );
}
await mkdir(`${output}/survey`, { recursive: true });
// Keep old shared/bookmarked links informative without exposing a form or collecting data.
const surveyBody = home.replace(
  /<main id="as-top">[\s\S]*?<\/main>/,
  '<main id="as-top" class="legal-page"><h1>The launcher survey has closed</h1><p>Thank you to everyone who shared their feedback. We’re keeping the responses to help improve Azuria Launcher.</p><p><a href="/">Return to Azuria Studios</a></p></main>',
);
await writeFile(
  `${output}/survey/index.html`,
  render(
    "Survey closed — Azuria Studios",
    surveyBody,
    "The Azuria Launcher feedback survey is now closed.",
    "survey/",
  ),
);
await cp(`${root}assets`, `${output}/assets`, { recursive: true });
await cp(`${root}src/site.css`, `${output}/site.css`);
await cp(`${root}src/site.js`, `${output}/site.js`);
await writeFile(
  `${output}/404.html`,
  render(
    "Page not found — Azuria Studios",
    home.replace(
      /<main id="as-top">[\s\S]*?<\/main>/,
      '<main id="as-top" class="legal-page"><h1>Page not found</h1><p>That page isn’t here. <a href="/">Return to Azuria Studios</a>.</p></main>',
    ),
    "This page could not be found.",
    "404.html",
  ),
);
console.log("Built Azuria Studios website in dist/");

await cp(`${root}src/theme.js`, `${output}/theme.js`);

for (const name of ["analytics.js", "analytics.css"])
  await cp(`${root}src/${name}`, `${output}/${name}`);

const indexablePaths = [
  "",
  "privacy/",
  "terms/",
  "contact/",
  "cookie-policy/",
  "data-request/",
];
const xmlEscape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
await writeFile(
  `${output}/robots.txt`,
  `User-agent: *\nAllow: /\n${preview ? "" : `Sitemap: ${new URL("sitemap.xml", siteOrigin).href}\n`}`,
);
await writeFile(
  `${output}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${preview ? "" : indexablePaths.map((path) => `<url><loc>${xmlEscape(new URL(path, siteOrigin).href)}</loc></url>`).join("")}</urlset>`,
);

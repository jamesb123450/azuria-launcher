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
const configEscape = (value = "") =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
const surveyUrl = (process.env.AZURIA_SUPABASE_URL || "").replace(/\/$/, "");
if (surveyUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(surveyUrl))
  throw new Error(
    "AZURIA_SUPABASE_URL must be your HTTPS Supabase project URL.",
  );
const banner =
  analytics +
  `<link rel="stylesheet" href="/survey.css"><div id="feedback-config" hidden data-url="${configEscape(surveyUrl)}" data-key="${configEscape(process.env.AZURIA_SUPABASE_PUBLISHABLE_KEY)}" data-sitekey="${configEscape(process.env.AZURIA_TURNSTILE_SITE_KEY)}"></div><script src="/survey.js" type="module"></script>`;
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
const surveyBody = home.replace(
  /<main id="as-top">[\s\S]*?<\/main>/,
  `<main id="as-top" class="survey-page"><div class="survey-intro"><p class="survey-eyebrow">AZURIA LAUNCHER · COMMUNITY SURVEY</p><h1>Your launcher.<br>Your priorities.</h1><p>Help us understand what matters to you. Choose as many answers as you like for each question. No account needed.</p><p class="survey-hint">All answers are anonymous. We don’t ask for names, emails or account details. Read our <a href="/privacy/">privacy policy</a>.</p></div><form id="feedback-form"><div id="feedback-questions"></div><section class="survey-written"><label for="feedback-extra">Anything else you’d like to share? <span class="survey-hint">(optional)</span></label><p id="feedback-extra-hint" class="survey-hint">Up to 2,000 characters. Please don’t include your name, email, account details or other personal information.</p><textarea id="feedback-extra" name="extraFeedback" maxlength="2000" rows="6" aria-describedby="feedback-extra-hint"></textarea></section><div class="survey-submit"><div id="feedback-challenge"></div><p id="feedback-status" role="status" aria-live="polite"></p><button class="survey-primary" id="feedback-send" type="submit">Send feedback</button><p class="survey-hint">Please choose at least one answer per question.</p></div></form><section id="feedback-thanks" hidden tabindex="-1"><h2>Thanks for helping shape Azuria.</h2><p>Your feedback has been recorded. We’ll use it to decide what to improve next.</p><a href="/">Back to Azuria Studios →</a></section></main>`,
);
await writeFile(
  `${output}/survey/index.html`,
  render(
    "Launcher survey — Azuria Studios",
    surveyBody,
    "Tell us what matters to you in a Minecraft launcher. An anonymous survey from Azuria Studios.",
    "survey/",
  ),
);
for (const name of [
  "survey.js",
  "survey.css",
  "survey-definition.mjs",
  "survey-errors.mjs",
])
  await cp(`${root}src/${name}`, `${output}/${name}`);
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
  "survey/",
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

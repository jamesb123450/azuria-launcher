import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { privacy, terms } from "../src/legal.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}dist`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const home = await readFile(`${root}src/home.html`, "utf8");
const banner = `<section class="cookie-banner" aria-label="Cookie preferences" hidden><div><h2>Your privacy, your choice</h2><p>We store your theme and cookie preferences in this browser. We don’t currently use optional cookies or tracking. Read our <a href="/privacy/">privacy policy</a>.</p></div><div class="cookie-actions"><button type="button" data-cookie-choice="rejected">Reject optional</button><button type="button" data-cookie-choice="accepted">Accept optional</button></div></section><p class="site-announcement" aria-live="polite"></p>`;
const render = (title, body, description) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${description}"><meta name="theme-color" content="#101116"><title>${title}</title><link rel="icon" href="/assets/azuria.png"><script src="/theme.js"></script><link rel="stylesheet" href="/site.css"><script src="/site.js" defer></script></head><body><a class="skip-link" href="#as-top">Skip to content</a>${body.replace(/<\/div>\s*$/, `${banner}</div>`)}</body></html>`;
await writeFile(
  `${output}/index.html`,
  render(
    "Azuria Studios — Great experiences start here.",
    home,
    "The home of Azuria Launcher and the projects that come next.",
  ),
);
for (const [slug, content, title] of [
  ["privacy", privacy, "Privacy policy"],
  ["terms", terms, "Terms of service"],
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
    ),
  );
}
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
  ),
);
console.log("Built Azuria Studios website in dist/");

await cp(`${root}src/theme.js`, `${output}/theme.js`);

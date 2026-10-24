import test from "node:test";
import assert from "node:assert/strict";
import { studioSEO } from "../src/seo.mjs";
test("studio metadata uses per-page production URLs and escaped descriptions", () => {
  const html = studioSEO({
    title: "Contact <Azuria>",
    description: "Privacy & support",
    path: "contact/",
    verification: "test_public-token",
  });
  assert.match(
    html,
    /rel="canonical" href="https:\/\/www.azuriasmp.org\/contact\/"/,
  );
  assert.match(html, /og:title" content="Contact &lt;Azuria&gt;/);
  assert.match(html, /og:description" content="Privacy &amp; support/);
  assert.match(html, /twitter:image/);
  assert.match(html, /google-site-verification" content="test_public-token/);
  assert.match(html, /index, follow/);
  assert.match(
    studioSEO({ title: "Missing", description: "Not found", path: "404.html" }),
    /noindex, nofollow/,
  );
  assert.match(
    studioSEO({ title: "Preview", description: "Preview", preview: true }),
    /noindex, nofollow/,
  );
  assert.throws(() =>
    studioSEO({ title: "Bad", description: "Bad", origin: "javascript:bad" }),
  );
  assert.throws(() =>
    studioSEO({ title: "Bad", description: "Bad", verification: "<script>" }),
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyticsMarkup } from "../apps/frontend/src/analytics.mjs";

test("GA4 IDs are validated and subdirectory deployments retain local consent assets", () => {
  for (const id of [
    "<script>alert(1)</script>",
    "GTM-ABCDEF",
    'G-ABC\" onload=\"x',
    "UA-123-4",
  ]) {
    assert.throws(() => analyticsMarkup({ id }), /measurement ID/);
  }
  const html = analyticsMarkup({ id: " G-ABCDE12345 ", base: "/launcher/" });
  assert.match(html, /data-measurement-id="G-ABCDE12345"/);
  assert.match(html, /src="\/launcher\/analytics.js"/);
  assert.match(html, /href="\/launcher\/privacy\/"/);
  assert.doesNotMatch(html, /src="https:/);
  assert.match(analyticsMarkup(), /Optional analytics is currently disabled/);
});

test("independent Vercel projects keep the same consent implementation", async () => {
  for (const name of ["analytics.js", "analytics.css", "analytics.mjs"]) {
    const launcher = await readFile(
      new URL(`../apps/frontend/src/${name}`, import.meta.url),
      "utf8",
    );
    const studios = await readFile(
      new URL(`../apps/azuria-studios/frontend/src/${name}`, import.meta.url),
      "utf8",
    );
    assert.equal(launcher, studios, name);
  }
});

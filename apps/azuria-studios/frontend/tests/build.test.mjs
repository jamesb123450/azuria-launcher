import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../scripts/build.mjs";
const root = new URL("../dist/", import.meta.url);
test("home and legal routes are complete static documents with shared controls", async () => {
  for (const path of [
    "index.html",
    "privacy/index.html",
    "terms/index.html",
    "404.html",
  ]) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.match(html, /<!doctype html>/);
    assert.equal((html.match(/<main /g) || []).length, 1);
    assert.match(html, /class="cookie-settings"/);
    assert.match(html, /data-cookie-choice="rejected"/);
    assert.match(html, /data-cookie-choice="accepted"/);
    assert.match(html, /href="\/privacy\/"/);
    assert.match(html, /href="\/terms\/"/);
    assert.doesNotMatch(html, /data:image|data-lucide|<style|<script(?! src=)/);
  }
});
test("Vercel publishes static files without a catch-all that hides legal routes", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.rewrites, undefined);
});

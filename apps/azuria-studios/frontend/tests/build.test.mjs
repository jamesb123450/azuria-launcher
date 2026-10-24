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
    "survey/index.html",
    "contact/index.html",
    "data-request/index.html",
    "cookie-policy/index.html",
  ]) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.match(html, /<!doctype html>/);
    assert.equal((html.match(/<main /g) || []).length, 1);
    assert.match(html, /class="cookie-settings"/);
    assert.match(html, /data-analytics-choice="rejected"/);
    assert.match(html, /data-analytics-choice="accepted"/);
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

test("supplied policy retains all sections, working anchors and safe themed markup", async () => {
  const html = await readFile(new URL("privacy/index.html", root), "utf8");
  const content = html.match(
    /<article class="privacy-notice">([\s\S]*?)<\/article>/,
  )[1];
  assert.equal((content.match(/<h2\b/g) || []).length, 16);
  assert.match(content, /privacy@azuriasmp.org/);
  assert.match(content, /October 24, 2026/);
  assert.match(content, /Termly/);
  assert.match(content, /Global Privacy Control/);
  assert.match(content, /<table>/);
  assert.doesNotMatch(
    content,
    /<style|style=|data-custom-class|<bdt|_{5,}|data:image|http:\/\/www\.azuriasmp/,
  );
  const ids = new Set([...content.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const match of content.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.has(match[1]), `Missing policy anchor ${match[1]}`);
  for (const route of ["contact", "data-request", "cookie-policy"]) {
    assert.match(
      await readFile(new URL(`${route}/index.html`, root), "utf8"),
      /<h1>/,
    );
  }
});

test("studio policies expose GDPR rights, privacy email and dated terms", async () => {
  const privacy = await readFile(new URL("privacy/index.html", root), "utf8");
  const terms = await readFile(new URL("terms/index.html", root), "utf8");
  const contact = await readFile(new URL("contact/index.html", root), "utf8");
  assert.match(privacy, /UK GDPR/);
  assert.match(terms, /<time datetime="2026-10-24">24 October 2026<\/time>/);
  assert.match(contact, /mailto:privacy@azuriasmp.org/);
  assert.match(privacy, /cookie-policy/);
});

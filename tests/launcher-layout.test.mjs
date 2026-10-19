import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const native = new URL("apps/app/", root);
test("native packaging locates the separately built frontend", async () => {
  const config = JSON.parse(
    await readFile(new URL("tauri.conf.json", native), "utf8"),
  );
  const output = new URL(
    config.build.frontendDist.replace(/\/$/, "") + "/",
    native,
  );
  assert.ok((await stat(new URL("index.html", output))).isFile());
  const html = await readFile(new URL("index.html", output), "utf8");
  for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g))
    assert.ok((await stat(new URL(path.slice(1), output))).isFile(), path);
  assert.equal(
    config.identifier,
    "com.azuria.launcher",
    "Splitting source must preserve the installed application's identity",
  );
});
test("native library path dependencies resolve after the move", async () => {
  const manifest = await readFile(new URL("Cargo.toml", native), "utf8");
  let paths = 0;
  for (const [, relative] of manifest.matchAll(/path\s*=\s*"([^"\n]+)"/g)) {
    const file = new URL(relative + "/Cargo.toml", native);
    assert.ok((await stat(file)).isFile(), file.href);
    paths++;
  }
  assert.equal(paths, 4);
});

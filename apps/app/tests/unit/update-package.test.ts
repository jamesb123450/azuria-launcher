import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("publishes matching safe filenames without changing signed bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "azuria-package-"));
  temporary.push(root);
  const folder = join(root, "target/release/bundle/nsis");
  await mkdir(folder, { recursive: true });
  const original = "Azuria Launcher_0.2.25_x64-setup.exe";
  const payload = Buffer.from("signed installer fixture");
  await writeFile(join(folder, original), payload);
  await writeFile(join(folder, original + ".sig"), "fixture-signature\n");
  const notes = "## This release\n\n- Restore saved sign-in on reconnect.\n";
  await writeFile(join(root, "release-notes.generated.md"), notes);
  const run = () =>
    execFileSync(process.execPath, [resolve("scripts/prepare-update.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        AZURIA_RELEASE_VERSION: "0.2.25",
        AZURIA_RELEASE_REPOSITORY: "jamesb123450/azuria-launcher",
      },
    });
  run();
  const manifest = JSON.parse(
    await readFile(join(folder, "latest.json"), "utf8"),
  );
  const platform = manifest.platforms["windows-x86_64"];
  const installer = decodeURIComponent(
    basename(new URL(platform.url).pathname),
  );
  expect(manifest.notes).toBe(notes.trim());
  expect(installer).toMatch(/^[A-Za-z0-9_.-]+$/);
  expect(await readdir(folder)).toContain(installer);
  expect(await readFile(join(folder, installer))).toEqual(payload);
  expect(
    (await readFile(join(folder, installer + ".sig"), "utf8")).trim(),
  ).toBe(platform.signature);
  // Re-running packaging must preserve the same usable installer and manifest.
  run();
  expect(await readFile(join(folder, installer))).toEqual(payload);
});

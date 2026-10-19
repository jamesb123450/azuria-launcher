import test from "node:test";
import assert from "node:assert/strict";
import { affectsLauncher } from "../.github/scripts/release-scope.mjs";

test("other products cannot trigger a launcher publication", () => {
  for (const path of [
    "apps/launcher-website/src/pages.mjs",
    "apps/studios-website/index.html",
    "apps/new-product/index.ts",
    "services/curseforge/worker.mjs",
    "infrastructure/server.yml",
    "docs/MONOREPO.md",
    "README.md",
    ".github/workflows/website.yml",
    ".github/workflows/checks.yml",
  ])
    assert.equal(affectsLauncher([path]), false, path);
});
test("launcher and its shared build dependencies trigger a release", () => {
  for (const path of [
    "apps/launcher-frontend/src/App.vue",
    "apps/launcher/src/lib.rs",
    "packages/azuria-core/src/lib.rs",
    "packages/azuria-auth/src/lib.rs",
    "packages/azuria-content/src/lib.rs",
    "packages/azuria-launch/src/lib.rs",
    "apps/launcher-frontend/vite.config.ts",
    "apps/launcher/docs/RELEASE_NOTES.md",
    "packages/release-tools/index.mjs",
    "package.json",
    "package-lock.json",
  ])
    assert.equal(affectsLauncher([path]), true, path);
  assert.equal(affectsLauncher(["apps/launcher/README.md"]), false);
  assert.equal(
    affectsLauncher(["apps/launcher-frontend/docs/FONT-LICENSE.txt"]),
    false,
  );
  assert.equal(affectsLauncher([]), false);
  assert.equal(
    affectsLauncher([
      "apps/launcher-website/src/pages.mjs",
      "apps/launcher-frontend/src/App.vue",
    ]),
    true,
  );
});

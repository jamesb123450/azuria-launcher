import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { publicRepository } from "./release-host.mjs";
const token = process.env.AZURIA_RELEASES_TOKEN;
if (!token)
  throw new Error("Configure the AZURIA_RELEASES_TOKEN Actions secret");
const built = resolve("website/dist");
if (!existsSync(join(built, "index.html")))
  throw new Error("Build the website before publishing");
const cwd = mkdtempSync(join(tmpdir(), "azuria-public-site-"));
const env = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
  GIT_CONFIG_VALUE_0:
    "AUTHORIZATION: basic " +
    Buffer.from("x-access-token:" + token).toString("base64"),
};
function git(args) {
  return execFileSync("git", args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
try {
  git([
    "clone",
    "--depth",
    "1",
    `https://github.com/${publicRepository}.git`,
    ".",
  ]);
  // Copy only compiled public assets, never the source checkout or its git history.
  rmSync(join(cwd, "site"), { recursive: true, force: true });
  cpSync(built, join(cwd, "site"), { recursive: true });
  git(["add", "--", "site"]);
  let changed = false;
  try {
    git(["diff", "--cached", "--quiet"]);
  } catch (error) {
    if (error.status !== 1) throw error;
    changed = true;
  }
  if (changed) {
    git([
      "-c",
      "user.name=github-actions[bot]",
      "-c",
      "user.email=41898282+github-actions[bot]@users.noreply.github.com",
      "commit",
      "-m",
      "Publish Azuria website",
    ]);
    git(["push", "origin", "HEAD:main"]);
  }
} catch {
  console.error(
    "Website publication failed. Check destination permissions and retry after concurrent changes finish.",
  );
  process.exitCode = 1;
} finally {
  rmSync(cwd, { recursive: true, force: true });
}

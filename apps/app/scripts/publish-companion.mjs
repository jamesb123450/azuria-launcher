import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { publicRepository } from "@azuria/release-tools";

const tag = "companion-feed-v1";
const asset = "companion.json";
const jar = resolve("mods/azuria-capes/build/libs/azuria-companion-mod.jar");
const work = mkdtempSync(join(tmpdir(), "azuria-companion-"));
const gh = (...args) =>
  execFileSync("gh", [...args, "--repo", publicRepository], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const parseVersion = (value) => {
  if (!/^\d+\.\d+\.\d+$/.test(value))
    throw new Error("Invalid companion version");
  return value.split(".").map(Number);
};

try {
  execFileSync("jar", ["xf", jar, "fabric.mod.json"], { cwd: work });
  const metadata = JSON.parse(
    readFileSync(join(work, "fabric.mod.json"), "utf8"),
  );
  const version = parseVersion(metadata.version);
  if (
    metadata.id !== "azuria_capes" ||
    metadata.depends?.minecraft !== "1.21.1" ||
    metadata.depends?.fabricloader !== ">=0.16.14" ||
    metadata.custom?.["azuria:bridge"] !== 1
  ) {
    throw new Error("JAR does not match the companion feed compatibility");
  }

  const file = join(work, asset);
  const bytes = readFileSync(jar);
  const signature = readFileSync(jar + ".sig", "utf8").trim();
  if (!bytes.length || bytes.length > 1024 * 1024 || !signature)
    throw new Error("Missing, oversized or unsigned companion JAR");
  let release;
  try {
    release = JSON.parse(
      gh("release", "view", tag, "--json", "isPrerelease,isDraft,assets"),
    );
  } catch (error) {
    if (!/release not found/i.test(error.stderr ?? "")) throw error;
  }

  if (release) {
    if (!release.isPrerelease || release.isDraft)
      throw new Error("Companion feed must be a published prerelease");
  }
  if (release?.assets.some(({ name }) => name === asset)) {
    gh("release", "download", tag, "--pattern", asset, "--dir", work);
    const previous = parseVersion(
      JSON.parse(readFileSync(file, "utf8")).version,
    );
    const change = version.findIndex((part, index) => part !== previous[index]);
    if (change < 0 || version[change] < previous[change])
      throw new Error("Increase the companion version before publishing");
  }

  writeFileSync(
    file,
    JSON.stringify({
      version: metadata.version,
      jar: bytes.toString("base64"),
      signature,
    }),
  );
  if (release) {
    gh("release", "upload", tag, file, "--clobber");
  } else {
    gh(
      "release",
      "create",
      tag,
      file,
      "--prerelease",
      "--latest=false",
      "--title",
      "Azuria companion updates",
      "--notes",
      "Automatic companion mod updates for Azuria-enabled Fabric 1.21.1 profiles.",
    );
  }
  console.log(`Published companion mod ${metadata.version}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

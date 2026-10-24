import { appendFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { publicRepository } from "@azuria/release-tools";
export { publicRepository };
export function nextVersion(tags) {
  const patches = tags.filter(Boolean).map((tag) => {
    const match = /^v0\.2\.(\d+)$/.exec(tag);
    if (!match)
      throw new Error(
        "Unsupported latest release version; review numbering manually",
      );
    return Number(match[1]);
  });
  const patch = Math.max(0, ...patches) + 1;
  if (!Number.isSafeInteger(patch) || patch > 65535)
    throw new Error("Windows version limit exceeded");
  return `0.2.${patch}`;
}
export function releaseNotes(commits) {
  if (!Array.isArray(commits) || !commits.length)
    throw new Error("No unpublished changes found for this release");
  const changes = [
    ...new Set(
      commits
        .filter((item) => (item.parents?.length ?? 1) <= 1)
        .flatMap((item) => {
          const message = item.commit?.message;
          if (typeof message !== "string")
            throw new Error("Invalid release comparison");
          const lines = message.split(/\r?\n/);
          const marker = lines.findIndex((line) =>
            /^Release notes:$/i.test(line.trim()),
          );
          const bullets = [];
          if (marker >= 0) {
            for (const line of lines.slice(marker + 1)) {
              if (!line.trim() && !bullets.length) continue;
              if (!line.trim().startsWith("- ")) break;
              bullets.push(line.trim().slice(2));
            }
          }
          return (bullets.length ? bullets : [lines[0]]).map((line) =>
            line.trim().replace(/[\x00-\x1f\x7f]/g, ""),
          );
        })
        .filter(
          (line) =>
            line && !/^Merge (pull request|branch|remote-tracking)/i.test(line),
        ),
    ),
  ];
  if (!changes.length) throw new Error("No release changes could be described");
  // Include only this release's comparison range, never a rolling release history.
  return (
    "## What's new\n\n" + changes.map((line) => `- ${line}`).join("\n") + "\n"
  );
}

function sourceRepository() {
  const source = process.env.GITHUB_REPOSITORY;
  if (!/^[\w-]+\/[\w.-]+$/.test(source || "") || source === publicRepository)
    throw new Error("Invalid source repository");
  return source;
}
async function get(path, token, optional = false) {
  if (!token)
    throw new Error(
      "Required Actions token is missing; configure AZURIA_RELEASES_TOKEN and GITHUB_TOKEN",
    );
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Azuria-Release",
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (optional && response.status === 404) return null;
  if (!response.ok)
    throw new Error(
      `GitHub release configuration request failed (${response.status}); check repository access`,
    );
  return response.json();
}
export async function configure() {
  const source = sourceRepository();
  const publicToken = process.env.AZURIA_RELEASES_TOKEN;
  const sourceToken = process.env.GITHUB_TOKEN;
  const [destination, origin, latest, legacy] = await Promise.all([
    get(`repos/${publicRepository}`, publicToken),
    get(`repos/${source}`, sourceToken),
    get(`repos/${publicRepository}/releases/latest`, publicToken, true),
    get(`repos/${source}/releases/latest`, sourceToken, true),
  ]);
  if (destination.private !== false)
    throw new Error("The distribution repository must be public");
  const ref = await get(
    `repos/${publicRepository}/git/ref/heads/${encodeURIComponent(destination.default_branch)}`,
    publicToken,
  );
  if (!/^[a-f0-9]{40}$/.test(ref.object?.sha || ""))
    throw new Error("Invalid public release target");
  const version = nextVersion([latest?.tag_name, legacy?.tag_name]);
  const head = process.env.GITHUB_SHA;
  let base = process.env.AZURIA_RELEASE_BEFORE;
  if (!/^[a-f0-9]{40}$/.test(head || ""))
    throw new Error("Missing release source commit");
  if (latest?.tag_name) {
    const previous = await get(
      `repos/${source}/git/ref/tags/${encodeURIComponent(latest.tag_name)}`,
      sourceToken,
      true,
    );
    if (previous) base = latest.tag_name;
  }
  if (
    !base ||
    /^0{40}$/.test(base) ||
    (!/^v0\.2\.\d+$/.test(base) && !/^[a-f0-9]{40}$/.test(base))
  )
    throw new Error("Missing previous release boundary");
  const comparison = await get(
    `repos/${source}/compare/${encodeURIComponent(base)}...${head}`,
    sourceToken,
  );
  if (comparison.status !== "ahead" || comparison.commits?.length >= 250)
    throw new Error(
      "Release history is incomplete or this commit is already published",
    );
  writeFileSync("release-notes.generated.md", releaseNotes(comparison.commits));
  writeFileSync(
    "update-build.json",
    JSON.stringify({ version, bundle: { createUpdaterArtifacts: true } }),
  );
  appendFileSync(
    process.env.GITHUB_ENV,
    `AZURIA_RELEASE_VERSION=${version}\nAZURIA_RELEASE_REPOSITORY=${publicRepository}\nAZURIA_PUBLIC_RELEASE_TARGET=${ref.object.sha}\nAZURIA_LEGACY_PUBLISH=${origin.private === false}\n`,
  );
  console.log(
    `Prepared ${version} for ${publicRepository}; legacy bridge: ${origin.private === false}`,
  );
}
function gh(args, token) {
  if (!token) throw new Error("Required release token is missing");
  return execFileSync("gh", args, {
    env: { ...process.env, GH_TOKEN: token },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export function publish() {
  const version = process.env.AZURIA_RELEASE_VERSION;
  if (
    !/^0\.2\.\d+$/.test(version || "") ||
    Number(version.split(".")[2]) > 65535 ||
    process.env.AZURIA_RELEASE_REPOSITORY !== publicRepository
  )
    throw new Error("Invalid public release configuration");
  if (!/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ""))
    throw new Error("Invalid source release commit");
  const installer = `Azuria-Launcher_${version}_x64-setup.exe`;
  const folder = "target/release/bundle/nsis";
  const assets = [installer, installer + ".sig", "latest.json"].map((name) =>
    join(folder, name),
  );
  for (const asset of assets)
    if (!statSync(asset).isFile() || statSync(asset).size === 0)
      throw new Error("Missing release asset");
  const manifest = JSON.parse(readFileSync(assets[2], "utf8"));
  const platform = manifest.platforms?.["windows-x86_64"];
  if (
    manifest.version !== version ||
    manifest.notes !==
      readFileSync("release-notes.generated.md", "utf8").trim() ||
    platform?.url !==
      `https://github.com/${publicRepository}/releases/download/v${version}/${installer}` ||
    !platform.signature ||
    platform.signature !== readFileSync(assets[1], "utf8").trim()
  )
    throw new Error("Invalid public updater manifest");
  const targets = [
    {
      repo: publicRepository,
      sha: process.env.AZURIA_PUBLIC_RELEASE_TARGET,
      token: process.env.AZURIA_RELEASES_TOKEN,
    },
  ];
  if (process.env.AZURIA_LEGACY_PUBLISH === "true")
    targets.push({
      repo: sourceRepository(),
      sha: process.env.GITHUB_SHA,
      token: process.env.GITHUB_TOKEN,
    });
  for (const { repo, sha, token } of targets) {
    if (!/^[a-f0-9]{40}$/.test(sha || ""))
      throw new Error("Invalid release target SHA");
    const tag = `v${version}`;
    gh(
      [
        "release",
        "create",
        tag,
        "--repo",
        repo,
        "--draft",
        "--target",
        sha,
        "--title",
        `Azuria ${version}`,
        "--notes-file",
        "release-notes.generated.md",
      ],
      token,
    );
    gh(["release", "upload", tag, ...assets, "--repo", repo], token);
    gh(
      ["release", "edit", tag, "--repo", repo, "--draft=false", "--latest"],
      token,
    );
  }
  if (process.env.AZURIA_LEGACY_PUBLISH !== "true") {
    // Retain a private source boundary even when distributing through the public mirror.
    gh(
      [
        "api",
        `repos/${sourceRepository()}/git/refs`,
        "--method",
        "POST",
        "-f",
        `ref=refs/tags/v${version}`,
        "-f",
        `sha=${process.env.GITHUB_SHA}`,
      ],
      process.env.GITHUB_TOKEN,
    );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv[2] === "configure") await configure();
    else if (process.argv[2] === "publish") publish();
    else throw new Error("Expected configure or publish");
  } catch (error) {
    console.error(
      error.status
        ? "Publication failed. Check token access, existing tags and incomplete drafts before retrying."
        : error.message,
    );
    process.exitCode = 1;
  }
}

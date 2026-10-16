import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Website/source documentation and CI setup do not change the launcher binary.
// Unknown paths conservatively count as launcher changes.
export function affectsLauncher(paths) {
  const websitePath =
    /^(website\/|docs\/WEBSITE\.md$|\.github\/workflows\/website\.yml$|\.github\/workflows\/checks\.yml$|\.github\/scripts\/release-scope\.mjs$|README\.md$|\.gitignore$)/;
  return paths.some((path) => !websitePath.test(path));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const {
    AZURIA_BEFORE: before,
    AZURIA_COMMIT: commit,
    GITHUB_OUTPUT: output,
  } = process.env;
  if (
    !/^[a-f0-9]{40}$/.test(before || "") ||
    !/^[a-f0-9]{40}$/.test(commit || "") ||
    !output
  )
    throw new Error("Missing or invalid workflow commit metadata");
  // GitHub uses an all-zero before SHA for a newly created branch.
  // Treat it conservatively as app-relevant without diffing an absent object.
  const paths = /^0{40}$/.test(before)
    ? ["__new_branch__"]
    : execFileSync("git", ["diff", "--name-only", "-z", before, commit], {
        encoding: "utf8",
      })
        .split("\0")
        .filter(Boolean);
  const publish = affectsLauncher(paths);
  appendFileSync(output, `publish=${publish}\n`);
  console.log(
    publish
      ? "Launcher changes detected."
      : "Website/documentation changes only; no launcher release.",
  );
}

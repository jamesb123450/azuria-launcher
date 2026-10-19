import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Products outside this explicit dependency boundary cannot publish a launcher.
export function affectsLauncher(paths) {
  return paths.some((path) => {
    if (path.startsWith("apps/launcher/")) {
      const local = path.slice("apps/launcher/".length);
      return !/^(README\.md$|docs\/(?!RELEASE_NOTES\.md$))/.test(local);
    }
    return (
      path.startsWith("packages/release-tools/") ||
      ["package.json", "package-lock.json"].includes(path)
    );
  });
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
  const paths = /^0{40}$/.test(before)
    ? ["apps/launcher/__new_branch__"]
    : execFileSync("git", ["diff", "--name-only", "-z", before, commit], {
        encoding: "utf8",
      })
        .split("\0")
        .filter(Boolean);
  const publish = affectsLauncher(paths);
  appendFileSync(output, `publish=${publish}\n`);
  console.log(
    publish ? "Launcher changes detected." : "No launcher release required.",
  );
}

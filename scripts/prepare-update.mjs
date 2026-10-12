import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// CI controls these values; reject malformed identifiers before constructing URLs.
const {
  AZURIA_RELEASE_VERSION: version,
  AZURIA_RELEASE_REPOSITORY: repository,
} = process.env;
if (!/^0\.2\.\d+$/.test(version ?? "") || Number(version.split(".")[2]) > 65535)
  throw new Error("Invalid Windows release version");
if (!/^[\w-]+\/[\w.-]+$/.test(repository ?? ""))
  throw new Error("Invalid release repository");
const folder = "src-tauri/target/release/bundle/nsis";
const installers = (await readdir(folder)).filter((name) =>
  name.endsWith(".exe"),
);
if (installers.length !== 1)
  throw new Error("Expected exactly one NSIS installer");
const installer = installers[0];
const signature = (
  await readFile(join(folder, installer + ".sig"), "utf8")
).trim();
if (!signature) throw new Error("Missing update signature");
const manifest = {
  version,
  notes: `Azuria development build ${version}. Includes changes that passed the frontend and Windows checks.`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(installer)}`,
    },
  },
};
await writeFile(
  join(folder, "latest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

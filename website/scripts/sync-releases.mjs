import { writeFile } from "node:fs/promises";
import {
  latestReleaseAPI,
  parseRelease,
  releaseRepository,
  legacyRepository,
} from "../src/release-data.mjs";
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Azuria-Website",
};
if (process.env.GH_TOKEN)
  headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
async function get(url, optional = false) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (optional && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Release metadata request failed (${response.status})`);
  return response.json();
}
let host = releaseRepository;
let latestData = await get(latestReleaseAPI, true);
if (!latestData) {
  host = legacyRepository;
  latestData = await get(
    "https://api.github.com/repos/jamesb123450/azuria-launcher/releases/latest",
  );
}
const history = await get(
  host.replace("https://github.com/", "https://api.github.com/repos/") +
    "/releases?per_page=30",
);
const latest = parseRelease(latestData, host);
if (!latest || !Array.isArray(history))
  throw new Error("Invalid published release metadata");
const older = history
  .map((value) => parseRelease(value, host))
  .filter((release) => release && release.tag !== latest.tag)
  .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
const releases = [latest, ...older].slice(0, 6);
await writeFile(
  new URL("../data/releases.json", import.meta.url),
  JSON.stringify(releases, null, 2) + "\n",
);
console.log(`Prepared ${releases.length} releases; latest ${latest.tag}`);

import { writeFile } from "node:fs/promises";
import { latestReleaseAPI, parseRelease } from "../src/release-data.mjs";
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Azuria-Website",
};
if (process.env.GH_TOKEN)
  headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
async function get(url) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Release metadata request failed (${response.status})`);
  return response.json();
}
const [latestData, history] = await Promise.all([
  get(latestReleaseAPI),
  get(
    "https://api.github.com/repos/jamesb123450/azuria-launcher/releases?per_page=30",
  ),
]);
const latest = parseRelease(latestData);
if (!latest || !Array.isArray(history))
  throw new Error("Invalid published release metadata");
const older = history
  .map(parseRelease)
  .filter((release) => release && release.tag !== latest.tag)
  .sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
const releases = [latest, ...older].slice(0, 6);
await writeFile(
  new URL("../data/releases.json", import.meta.url),
  JSON.stringify(releases, null, 2) + "\n",
);
console.log(`Prepared ${releases.length} releases; latest ${latest.tag}`);

import { writeFile } from "node:fs/promises";
const repository = "jamesb123450/azuria-launcher";
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Azuria-Website",
};
if (process.env.GH_TOKEN)
  headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
const response = await fetch(
  `https://api.github.com/repos/${repository}/releases?per_page=20`,
  { headers, signal: AbortSignal.timeout(20000) },
);
if (!response.ok)
  throw new Error(`Release metadata request failed (${response.status})`);
const releases = (await response.json())
  .filter(
    (r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name),
  )
  .slice(0, 6)
  .map((r) => {
    const installer = r.assets.find((a) =>
      /^Azuria-Launcher_[\d.]+_x64-setup\.exe$/.test(a.name),
    );
    return {
      tag: r.tag_name,
      version: r.tag_name.slice(1),
      url: r.html_url,
      published: r.published_at,
      notes: r.body || "",
      installer: installer?.browser_download_url || null,
      size: installer?.size || null,
    };
  });
if (!releases.length) throw new Error("No published releases found");
await writeFile(
  new URL("../data/releases.json", import.meta.url),
  JSON.stringify(releases, null, 2) + "\n",
);
console.log(`Prepared ${releases.length} releases; latest ${releases[0].tag}`);

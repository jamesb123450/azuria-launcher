import type { GameVersion } from "./game-versions";
export interface VersionSeries {
  id: string;
  versions: GameVersion[];
}
export function versionSeriesId(version: GameVersion): string {
  if (version.type !== "release") return version.id;
  const parts = version.id.split(".");
  return parts[0] === "1" ? parts.slice(0, 2).join(".") : parts[0];
}
export function groupVersionSeries(versions: GameVersion[]): VersionSeries[] {
  const groups = new Map<string, VersionSeries>();
  for (const version of versions) {
    const id = versionSeriesId(version);
    if (!groups.has(id)) groups.set(id, { id, versions: [] });
    groups.get(id)!.versions.push(version);
  }
  return [...groups.values()];
}

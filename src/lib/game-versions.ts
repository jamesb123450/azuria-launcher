export interface GameVersion {
  id: string;
  type: string;
}
const endpoint =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
let cached: Promise<GameVersion[]> | undefined;

// Fetch metadata only, from Mojang's fixed HTTPS endpoint. Failure leaves manual entry available.
export function gameVersions(): Promise<GameVersion[]> {
  if (!cached) {
    cached = fetch(endpoint, { signal: AbortSignal.timeout(8000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Version catalogue is unavailable.");
        const data = await response.json();
        if (!Array.isArray(data.versions))
          throw new Error("Invalid version catalogue.");
        return data.versions
          .filter(
            (entry: GameVersion) =>
              typeof entry.id === "string" &&
              /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(entry.id) &&
              ["release", "snapshot"].includes(entry.type),
          )
          .map((entry: GameVersion) => ({
            id: entry.id,
            type: entry.type,
          })) as GameVersion[];
      })
      .catch((error) => {
        cached = undefined;
        throw error;
      });
  }
  return cached;
}

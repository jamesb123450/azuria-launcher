import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Loader } from "../types";
export interface LoaderVersion {
  id: string;
  stable: boolean;
}
const safeVersion = /^[a-zA-Z0-9][a-zA-Z0-9._+\-]{0,79}$/;
const cache = new Map<string, Promise<LoaderVersion[]>>();

export function loaderEndpoint(loader: Loader, game: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(game))
    throw new Error("Choose a valid game version first.");
  switch (loader) {
    case "fabric":
      return `https://meta.fabricmc.net/v2/versions/loader/${game}`;
    case "quilt":
      return `https://meta.quiltmc.org/v3/versions/loader/${game}`;
    case "forge":
      return "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
    case "neoforge":
      return game === "1.20.1"
        ? "https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml"
        : "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";
    default:
      throw new Error("Vanilla does not use a loader version.");
  }
}
export function parseLoaderVersions(
  loader: Loader,
  game: string,
  text: string,
): LoaderVersion[] {
  let versions: LoaderVersion[];
  if (loader === "fabric" || loader === "quilt") {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Invalid loader catalogue.");
    versions = data.flatMap((entry) => {
      const id = entry?.loader?.version;
      return typeof id === "string" && safeVersion.test(id)
        ? [
            {
              id,
              stable:
                typeof entry.loader.stable === "boolean"
                  ? entry.loader.stable
                  : !/(beta|alpha|rc|snapshot)/i.test(id),
            },
          ]
        : [];
    });
  } else {
    if (!text.includes("<metadata") || !text.includes("</metadata>"))
      throw new Error("Invalid loader catalogue.");
    const legacyNeo = loader === "neoforge" && game === "1.20.1";
    const parts = (game.startsWith("1.") ? game.slice(2) : game).split(".");
    const neoPrefix = `${parts[0]}.${parts[1] ?? "0"}.`;
    versions = Array.from(
      text.matchAll(/<version>([^<]+)<\/version>/g),
    ).flatMap((match) => {
      const raw = match[1] ?? "";
      const prefix = loader === "forge" || legacyNeo ? `${game}-` : neoPrefix;
      if (!raw.startsWith(prefix)) return [];
      const id =
        loader === "forge" || legacyNeo ? raw.slice(prefix.length) : raw;
      return safeVersion.test(id)
        ? [{ id, stable: !/(beta|alpha|rc|snapshot)/i.test(id) }]
        : [];
    });
  }
  return [...new Map(versions.map((entry) => [entry.id, entry])).values()].sort(
    (a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }),
  );
}
export function loaderVersions(
  loader: Loader,
  game: string,
): Promise<LoaderVersion[]> {
  const endpoint = loaderEndpoint(loader, game);
  const key = `${loader}:${game}`;
  if (!cache.has(key)) {
    const request: Promise<string> = isTauri()
      ? invoke("loader_metadata", { loader, game })
      : fetch(endpoint, { signal: AbortSignal.timeout(12000) }).then(
          (response) => {
            if (!response.ok)
              throw new Error("Could not reach the loader catalogue.");
            return response.text();
          },
        );
    cache.set(
      key,
      request
        .then((text) => parseLoaderVersions(loader, game, text))
        .catch((error) => {
          cache.delete(key);
          throw error;
        }),
    );
  }
  return cache.get(key)!;
}

export async function resolveLoaderVersion(
  loader: Loader,
  game: string,
  selection: string,
): Promise<string> {
  if (!["stable", "latest"].includes(selection)) {
    if (!safeVersion.test(selection))
      throw new Error("Choose a valid loader version.");
    return selection;
  }
  const list = await loaderVersions(loader, game);
  const selected =
    selection === "stable" ? list.find((entry) => entry.stable) : list[0];
  if (!selected)
    throw new Error(
      `No ${selection} loader is available for this Minecraft version. Choose another version.`,
    );
  return selected.id;
}

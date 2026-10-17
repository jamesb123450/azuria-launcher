import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export type Provider = "modrinth" | "curseforge";
export type Kind = "mods" | "modpacks" | "datapacks" | "resourcepacks";
export interface Project {
  id: string;
  name: string;
  description: string;
  author: string;
  url: string;
  downloads: number;
  categories: string[];
}
export interface Version {
  id: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  releaseType: string;
}
export interface Search {
  provider: Provider;
  kind: Kind;
  query: string;
  gameVersion: string;
  loader: string;
  category: string;
  sort: string;
  offset: number;
  limit: number;
}
export interface Target {
  minecraft: string;
  loader: string;
  loaderVersion: string | null;
}
export interface Preview {
  files: number;
  bytes: number;
  names: string[];
  target: Target;
}
export interface Plan {
  id: string;
  preview: Preview;
}
export interface ContentJob {
  id: string;
  stage: string;
  message: string;
  completed: number;
  total: number;
}
async function mr(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
) {
  const url = new URL("https://api.modrinth.com/v2/" + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      response.status === 429
        ? "Modrinth rate limit reached. Wait a moment and retry."
        : "Could not reach Modrinth. Retry shortly.",
    );
  return response.json();
}
export const contentApi = {
  status: (): Promise<{ curseforgeConfigured: boolean }> =>
    desktop
      ? invoke("content_status")
      : Promise.resolve({ curseforgeConfigured: false }),
  setKey: (key: string | null): Promise<void> =>
    invoke("content_set_curseforge_key", { key }),
  search: async (
    query: Search,
    signal?: AbortSignal,
  ): Promise<{ projects: Project[]; total: number }> => {
    if (desktop) return invoke("content_search", { query });
    if (query.provider === "curseforge")
      throw Error(
        "CurseForge search requires API access configured in the Windows app.",
      );
    const type =
      query.kind === "resourcepacks"
        ? "resourcepack"
        : query.kind === "modpacks"
          ? "modpack"
          : "mod";
    const facets = [[`project_type:${type}`]];
    if (query.kind === "datapacks") facets.push(["categories:datapack"]);
    if (query.gameVersion) facets.push([`versions:${query.gameVersion}`]);
    if (query.loader) facets.push([`categories:${query.loader}`]);
    if (query.category) facets.push([`categories:${query.category}`]);
    const data = await mr(
      "search",
      {
        query: query.query,
        facets: JSON.stringify(facets),
        index: ["downloads", "updated"].includes(query.sort)
          ? query.sort
          : "relevance",
        offset: String(query.offset),
        limit: String(query.limit),
      },
      signal,
    );
    return {
      total: data.total_hits,
      projects: data.hits.map((p: Record<string, unknown>) => ({
        id: String(p.project_id),
        name: String(p.title),
        description: String(p.description),
        author: String(p.author),
        url: `https://modrinth.com/${type}/${String(p.slug)}`,
        downloads: Number(p.downloads),
        categories: Array.isArray(p.categories) ? p.categories : [],
      })),
    };
  },
  versions: (
    provider: Provider,
    project: string,
    kind: Kind,
    instanceId: string | null,
  ): Promise<Version[]> =>
    invoke("content_versions", { provider, project, kind, instanceId }),
  plan: (
    provider: Provider,
    project: string,
    version: string,
    kind: Kind,
    instanceId: string | null,
    name: string,
    world: string | null,
  ): Promise<Plan> =>
    invoke("content_plan", {
      provider,
      project,
      version,
      kind,
      instanceId,
      name,
      world,
    }),
  install: (planId: string): Promise<void> =>
    invoke("content_install", { planId }),
  cancel: (): Promise<void> => invoke("content_cancel"),
  job: (): Promise<ContentJob | null> =>
    desktop ? invoke("content_job") : Promise.resolve(null),
  open: (url: string) => {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !["modrinth.com", "www.curseforge.com"].includes(parsed.hostname)
    )
      return;
    if (desktop) return invoke("content_open_url", { url });
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

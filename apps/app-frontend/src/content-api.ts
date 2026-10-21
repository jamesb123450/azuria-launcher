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
  iconUrl?: string | null;
  categories: string[];
}
export interface InstalledProject {
  provider: Provider;
  project: Project;
  kind: Kind;
  version: string;
  versionName: string;
  latest: string | null;
  missing: number;
  mods: number;
  resourcePacks: number;
  files: string[];
}
export interface InstalledPackEntry {
  instanceId: string;
  pack: { provider: Provider; projectId: string; version: string };
}
export interface InstalledPacks {
  packs: InstalledPackEntry[];
  unreadable: string[];
}
export interface Inventory {
  pack: InstalledProject | null;
  projects: InstalledProject[];
  files: {
    name: string;
    project: Project;
    provider?: Provider;
    versionName?: string;
    releaseType?: string;
  }[];
}
export interface ProjectDetails {
  project: Project;
  body: string;
  bodyHtml: boolean;
  followers: number;
  gallery: { url: string; title: string; description: string }[];
}
export interface Version {
  id: string;
  name: string;
  gameVersions: string[];
  loaders: string[];
  releaseType: string;
  published?: string;
}
export interface VersionDetails {
  version: Version;
  changelog: string;
  html: boolean;
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
  installedPacks: (): Promise<InstalledPacks> =>
    desktop
      ? invoke("installed_modpacks")
      : Promise.resolve({ packs: [], unreadable: [] }),
  inventory: (id: string): Promise<Inventory> =>
    desktop
      ? invoke("content_inventory", { id })
      : Promise.resolve({ pack: null, projects: [], files: [] }),
  updatePlan: (
    id: string,
    provider: Provider,
    project: string,
    requestedVersion: string | null = null,
  ): Promise<Plan> =>
    invoke("content_update_plan", { id, provider, project, requestedVersion }),
  version: async (
    provider: Provider,
    project: string,
    version: string,
  ): Promise<VersionDetails> => {
    if (desktop)
      return invoke("content_version", { provider, project, version });
    if (provider !== "modrinth")
      throw Error("Use the desktop app for CurseForge details.");
    const v = await mr(`version/${encodeURIComponent(version)}`, {});
    if (v.project_id !== project)
      throw Error("Version does not belong to this project.");
    return {
      version: {
        id: v.id,
        name: v.name,
        gameVersions: v.game_versions,
        loaders: v.loaders,
        releaseType: v.version_type,
        published: v.date_published,
      },
      changelog: v.changelog ?? "",
      html: false,
    };
  },
  project: async (
    provider: Provider,
    project: string,
  ): Promise<ProjectDetails> => {
    if (desktop) return invoke("content_project", { provider, project });
    if (provider !== "modrinth")
      throw Error("CurseForge details require the Windows app and API access.");
    const p = await mr(`project/${encodeURIComponent(project)}`, {});
    return {
      project: {
        id: p.id,
        name: p.title,
        description: p.description,
        author: p.slug,
        url: `https://modrinth.com/${p.project_type}/${p.slug}`,
        downloads: p.downloads,
        categories: p.categories,
        iconUrl: p.icon_url,
      },
      body: p.body,
      bodyHtml: false,
      followers: p.followers,
      gallery: p.gallery,
    };
  },
  catalogueVersions: async (
    provider: Provider,
    project: string,
    kind: Kind,
  ): Promise<Version[]> => {
    if (desktop)
      return invoke("content_versions", {
        provider,
        project,
        kind,
        instanceId: null,
      });
    if (provider !== "modrinth")
      throw Error("CurseForge versions require the Windows app.");
    const versions = await mr(
      `project/${encodeURIComponent(project)}/version`,
      { include_changelog: "false" },
    );
    return versions.slice(0, 256).map((v: any) => ({
      id: v.id,
      name: v.name,
      gameVersions: v.game_versions,
      loaders: v.loaders,
      releaseType: v.version_type,
      published: v.date_published,
    }));
  },
  status: (): Promise<{ curseforgeConfigured: boolean }> =>
    desktop
      ? invoke("content_status")
      : Promise.resolve({ curseforgeConfigured: false }),
  search: async (
    query: Search,
    signal?: AbortSignal,
  ): Promise<{ projects: Project[]; total: number }> => {
    if (desktop) return invoke("content_search", { query });
    if (query.provider === "curseforge")
      throw Error(
        "CurseForge search requires a publisher-configured Windows build.",
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
        iconUrl: typeof p.icon_url === "string" ? p.icon_url : null,
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
    if (parsed.protocol !== "https:" || !!parsed.username || !!parsed.password)
      return;
    if (desktop) return invoke("content_open_url", { url });
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

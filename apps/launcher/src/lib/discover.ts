// Fictional catalogue fixtures for the discovery preview. No provider requests
// or installation actions are made until the integrations are implemented.
export type ContentKind = "modpacks" | "mods" | "datapacks" | "resourcepacks";
export interface DiscoveryProject {
  id: string;
  kind: ContentKind;
  name: string;
  author: string;
  description: string;
  category: string;
  loader: string;
  version: string;
  source: "Modrinth" | "CurseForge";
  downloads: number;
  followers: number;
  days: number;
  art: "landscape" | "orbit" | "blocks" | "spark";
}
const collections: Record<ContentKind, [string, string, string, string][]> = {
  modpacks: [
    [
      "Wildlight",
      "A quieter kind of adventure. New landscapes, little discoveries and a world worth getting lost in.",
      "Adventure",
      "Fabric",
    ],
    [
      "Framecraft",
      "A familiar world with a lighter footprint. Smooth performance, thoughtful tweaks and less waiting.",
      "Optimization",
      "Fabric",
    ],
    [
      "Copper & Steam",
      "Build a workshop, connect your machines and turn a small idea into something extraordinary.",
      "Technology",
      "Forge",
    ],
    [
      "Beyond the Pines",
      "Take the long way home through deep forests, forgotten ruins and unfamiliar biomes.",
      "Adventure",
      "NeoForge",
    ],
    [
      "Little Workshop",
      "A collection for careful builders, cosy interiors and all the details that make a place your own.",
      "Building",
      "Fabric",
    ],
    [
      "Moonbound",
      "A new chapter after sunset. Explore strange dimensions and bring something unexpected home.",
      "Adventure",
      "Quilt",
    ],
    [
      "Everyday Vanilla",
      "Small improvements for a familiar adventure. Keep the original feel, with a few welcome extras.",
      "Utility",
      "Fabric",
    ],
    [
      "Skyward Isles",
      "Start with a tiny island and a big idea. A sky full of possibilities is waiting beyond the clouds.",
      "Adventure",
      "NeoForge",
    ],
  ],
  mods: [
    [
      "Pocket Compass",
      "Mark the places that matter and always find your way back to your favourite corner of the world.",
      "Utility",
      "Fabric",
    ],
    [
      "Soft Horizon",
      "Thoughtful rendering improvements for a smoother view of your next adventure.",
      "Optimization",
      "Fabric",
    ],
    [
      "Workshop Pieces",
      "Little moving parts for big ideas. Add mechanical details to your next ambitious build.",
      "Technology",
      "Forge",
    ],
    [
      "Moss & Meadow",
      "Bring your world to life with wildflowers, hanging plants and quiet woodland details.",
      "Decoration",
      "NeoForge",
    ],
    [
      "Tidy Inventory",
      "Spend less time organising and more time exploring with a handful of useful inventory tools.",
      "Utility",
      "Quilt",
    ],
    [
      "Trail Notes",
      "Keep a journal of your journeys and leave a trail of discoveries for your friends.",
      "Adventure",
      "Fabric",
    ],
  ],
  datapacks: [
    [
      "Village Stories",
      "Give every settlement a little more character with new structures and discoveries.",
      "Adventure",
      "Vanilla",
    ],
    [
      "Better Harvests",
      "A gentler farming rhythm with small quality-of-life changes to your everyday crops.",
      "Utility",
      "Vanilla",
    ],
    [
      "Hidden Places",
      "Follow your curiosity to secret rooms, tucked-away ruins and rewards off the beaten path.",
      "Adventure",
      "Vanilla",
    ],
    [
      "Builder’s Recipes",
      "More ways to craft the details your next project needs, without leaving Vanilla behind.",
      "Building",
      "Vanilla",
    ],
    [
      "Campfire Moments",
      "Small comforts for long journeys. Make a temporary campsite feel a little more like home.",
      "Decoration",
      "Vanilla",
    ],
    [
      "World Waypoints",
      "A simple way to connect the places you return to, designed for a Vanilla world.",
      "Utility",
      "Vanilla",
    ],
  ],
  resourcepacks: [
    [
      "Rosewood",
      "Warm wood tones, soft stone and a considered palette for a world that feels like home.",
      "Decoration",
      "Vanilla",
    ],
    [
      "Clear Days",
      "Crisp, understated textures that keep the original character of Minecraft in focus.",
      "Optimization",
      "Vanilla",
    ],
    [
      "Paper Trails",
      "A hand-drawn touch for maps, menus and the little details of your next adventure.",
      "Adventure",
      "Vanilla",
    ],
    [
      "Quiet Geometry",
      "Clean lines and subtle materials for builds where every block has a purpose.",
      "Building",
      "Vanilla",
    ],
    [
      "Evening Glow",
      "A softer interface and warm accents for those just-one-more-block evenings.",
      "Decoration",
      "Vanilla",
    ],
    [
      "Glasshouse",
      "Clear windows, delicate frames and thoughtful details for light-filled spaces.",
      "Building",
      "Vanilla",
    ],
  ],
};
const authors = [
  "Northstar Studio",
  "Pixel Workshop",
  "Copper Collective",
  "Daydream Labs",
];
const art: DiscoveryProject["art"][] = [
  "landscape",
  "orbit",
  "blocks",
  "spark",
];
export const discoveryProjects: DiscoveryProject[] = Object.entries(
  collections,
).flatMap(([kind, rows]) =>
  rows.map(([name, description, category, loader], index) => ({
    id: `${kind}-${index}`,
    kind: kind as ContentKind,
    name: name!,
    description: description!,
    category: category!,
    loader: loader!,
    author: authors[index % authors.length]!,
    version: index % 3 === 2 ? "1.20.1" : "1.21.1",
    source: index % 3 === 2 ? "CurseForge" : "Modrinth",
    downloads: [1240000, 870000, 642000, 418000, 296000, 185000, 97000, 64000][
      index
    ]!,
    followers: 3820 - index * 319,
    days: [2, 5, 1, 12, 7, 18, 3, 24][index]!,
    art: art[index % art.length]!,
  })),
);
export interface DiscoveryFilters {
  kind: ContentKind;
  query: string;
  category: string;
  source: string;
  loader: string;
  version: string;
  sort: string;
}
export function filterDiscovery(filters: DiscoveryFilters): DiscoveryProject[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const result = discoveryProjects.filter(
    (project) =>
      project.kind === filters.kind &&
      (!query ||
        `${project.name} ${project.author} ${project.description} ${project.category} ${project.loader}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (!filters.category || project.category === filters.category) &&
      (!filters.source || project.source === filters.source) &&
      (!filters.loader || project.loader === filters.loader) &&
      (!filters.version || project.version === filters.version),
  );
  if (filters.sort === "downloads")
    result.sort((a, b) => b.downloads - a.downloads);
  if (filters.sort === "updated") result.sort((a, b) => a.days - b.days);
  if (filters.sort === "name")
    result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

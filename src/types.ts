export type Theme = "system" | "dark" | "light";
export const LOADERS = [
  { id: "vanilla", name: "Vanilla" },
  { id: "fabric", name: "Fabric" },
  { id: "neoforge", name: "NeoForge" },
  { id: "forge", name: "Forge" },
  { id: "quilt", name: "Quilt" },
] as const;
export type Loader = (typeof LOADERS)[number]["id"];
export function loaderName(loader: Loader) {
  return LOADERS.find((entry) => entry.id === loader)?.name ?? loader;
}
export interface Instance {
  id: string;
  name: string;
  minecraftVersion: string;
  loader: Loader;
  memoryMb: number;
  icon?: string | null;
  loaderVersion?: string | null;
  favorite: boolean;
  createdAt: number;
}
export interface InstanceInput {
  name: string;
  minecraftVersion: string;
  loader: Loader;
  memoryMb: number;
  icon?: string | null;
  loaderVersion?: string | null;
}
export interface Settings {
  theme: Theme;
}
export const DEFAULT_INPUT: InstanceInput = {
  name: "",
  minecraftVersion: "",
  loader: "vanilla",
  memoryMb: 4096,
  icon: null,
  loaderVersion: "stable",
};
export function validateInput(input: InstanceInput): string | null {
  if (
    !input.name.trim() ||
    Array.from(input.name.trim()).length > 80 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(input.name)
  )
    return "Use an instance name between 1 and 80 characters.";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(input.minecraftVersion))
    return "Enter a valid Minecraft version identifier.";
  if (!LOADERS.some((entry) => entry.id === input.loader))
    return "Choose a supported loader.";
  if (
    input.icon != null &&
    (input.icon.length > 131072 ||
      !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(
        input.icon,
      ))
  )
    return "Choose a valid instance icon.";
  if (
    input.loaderVersion != null &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._+\-]{0,79}$/.test(input.loaderVersion)
  )
    return "Enter a valid loader version.";
  if (
    !Number.isInteger(input.memoryMb) ||
    input.memoryMb < 512 ||
    input.memoryMb > 65536 ||
    input.memoryMb % 256 !== 0
  )
    return "Memory must be 512–65536 MB in increments of 256 MB.";
  return null;
}

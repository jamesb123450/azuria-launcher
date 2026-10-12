export type Theme = "system" | "dark" | "light";
export type Loader = "vanilla" | "fabric";
export interface Instance {
  id: string;
  name: string;
  minecraftVersion: string;
  loader: Loader;
  memoryMb: number;
  favorite: boolean;
  createdAt: number;
}
export interface InstanceInput {
  name: string;
  minecraftVersion: string;
  loader: Loader;
  memoryMb: number;
}
export interface Settings {
  theme: Theme;
}
export const DEFAULT_INPUT: InstanceInput = {
  name: "",
  minecraftVersion: "",
  loader: "vanilla",
  memoryMb: 4096,
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
  if (!["vanilla", "fabric"].includes(input.loader))
    return "Choose Vanilla or Fabric.";
  if (
    !Number.isInteger(input.memoryMb) ||
    input.memoryMb < 512 ||
    input.memoryMb > 65536 ||
    input.memoryMb % 256 !== 0
  )
    return "Memory must be 512–65536 MB in increments of 256 MB.";
  return null;
}

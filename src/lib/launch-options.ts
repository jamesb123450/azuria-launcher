import { memoryLimit } from "../system-memory";
export interface LaunchOptions {
  memoryMb: number;
  javaPath: string | null;
  javaArguments: string[];
  environment: Record<string, string>;
  window: { fullscreen: boolean; width: number; height: number };
}
export type LaunchOverrides = Partial<LaunchOptions>;
export type OverrideFlags = Record<keyof LaunchOptions, boolean>;
export const defaultLaunchOptions = (): LaunchOptions => ({
  memoryMb: 4096,
  javaPath: null,
  javaArguments: [],
  environment: {},
  window: { fullscreen: false, width: 1280, height: 720 },
});
export const overrideFlags = (overrides: LaunchOverrides): OverrideFlags =>
  Object.fromEntries(
    Object.keys(defaultLaunchOptions()).map((key) => [
      key,
      overrides[key as keyof LaunchOptions] != null,
    ]),
  ) as OverrideFlags;
export function effectiveOptions(
  defaults: LaunchOptions,
  overrides: LaunchOverrides,
): LaunchOptions {
  return JSON.parse(
    JSON.stringify({
      ...defaults,
      ...Object.fromEntries(
        Object.entries(overrides).filter(([, value]) => value != null),
      ),
    }),
  );
}
export function selectedOverrides(
  values: LaunchOptions,
  flags: OverrideFlags,
): LaunchOverrides {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => flags[key as keyof LaunchOptions]),
  );
}
export function validateOptions(value: LaunchOptions): string {
  if (
    !Number.isInteger(value.memoryMb) ||
    value.memoryMb < 512 ||
    (memoryLimit.value !== undefined && value.memoryMb > memoryLimit.value) ||
    value.memoryMb % 256 !== 0
  )
    return `Memory must be at least 512 MB, in increments of 256 MB, and within your computer’s ${memoryLimit.value ?? "physical"} MB memory limit.`;
  if (
    value.javaPath !== null &&
    (!value.javaPath.trim() ||
      value.javaPath.length > 4096 ||
      /[\u0000-\u001f]/.test(value.javaPath))
  )
    return "Enter a Java executable path or choose automatic selection.";
  if (
    value.javaArguments.length > 128 ||
    value.javaArguments.some(
      (a) => a.length > 4096 || /[\u0000-\u001f]/.test(a),
    ) ||
    value.javaArguments.join("").length > 16384
  )
    return "Java arguments are too long or contain invalid characters.";
  if (
    Object.keys(value.environment).length > 64 ||
    Object.entries(value.environment).some(
      ([k, v]) =>
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(k) ||
        v.length > 8192 ||
        /[\u0000-\u001f]/.test(v),
    )
  )
    return "Use valid environment variable names and single-line values.";
  const { width, height } = value.window;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 320 ||
    width > 16384 ||
    height < 240 ||
    height > 8640
  )
    return "Enter a valid window resolution (at least 320 × 240).";
  return "";
}

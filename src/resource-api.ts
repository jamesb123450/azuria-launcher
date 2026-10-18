import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export interface ResourceOptions {
  unusedDownloadGib: number;
  concurrentDownloads: number;
}
export interface StorageReport {
  token: number;
  usage: {
    directory: string;
    totalBytes: number;
    categories: { name: string; bytes: number }[];
    cleanupBytes: number;
    cleanupFiles: number;
    skipped: number;
  };
}
export const defaultResources = (): ResourceOptions => ({
  unusedDownloadGib: 5,
  concurrentDownloads: 8,
});
export function resourceValidation(options: ResourceOptions) {
  return !Number.isInteger(options.unusedDownloadGib) ||
    options.unusedDownloadGib < 0 ||
    options.unusedDownloadGib > 100 ||
    !Number.isInteger(options.concurrentDownloads) ||
    options.concurrentDownloads < 1 ||
    options.concurrentDownloads > 10
    ? "Keep 0–100 GiB of unused downloads and use 1–10 concurrent downloads."
    : "";
}
const previewKey = "azuria-resources-v1";
export const resourceApi = {
  options: async (): Promise<ResourceOptions> => {
    if (desktop) return invoke("resource_options");
    const raw = localStorage.getItem(previewKey);
    const value = raw ? JSON.parse(raw) : defaultResources();
    value.concurrentDownloads = Math.min(value.concurrentDownloads, 10);
    return value;
  },
  save: async (options: ResourceOptions) => {
    const error = resourceValidation(options);
    if (error) throw new Error(error);
    if (desktop) await invoke("save_resource_options", { options });
    else localStorage.setItem(previewKey, JSON.stringify(options));
  },
  usage: (refresh = false): Promise<StorageReport> =>
    invoke("storage_usage", { refresh }),
  cleanup: (token: number): Promise<number> =>
    invoke("storage_cleanup", { token }),
  open: (): Promise<void> => invoke("open_data_folder"),
};
export function fileSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}

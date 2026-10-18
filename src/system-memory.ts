import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export const memoryLimit = ref<number>();
export const memoryError = ref("");
let pending: Promise<void> | undefined;
export function loadMemory(): Promise<void> {
  if (memoryLimit.value) return Promise.resolve();
  return (pending ??= (async () => {
    memoryError.value = "";
    try {
      const value = desktop
        ? await invoke<number>("physical_memory_limit")
        : Math.floor(
            (((navigator as Navigator & { deviceMemory?: number })
              .deviceMemory ?? 8) *
              1024) /
              256,
          ) * 256;
      if (!Number.isInteger(value) || value < 512)
        throw Error("Physical memory could not be detected.");
      memoryLimit.value = value;
    } catch (e) {
      memoryError.value = String(e);
    } finally {
      pending = undefined;
    }
  })());
}

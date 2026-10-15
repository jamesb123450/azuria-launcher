import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  favorite: vi.fn(),
  remove: vi.fn(),
  saveSettings: vi.fn(),
  openProject: vi.fn(),
}));
vi.mock("../../src/api", () => ({ api }));
import { useLauncher } from "../../src/stores/launcher";

const input = {
  name: "World",
  minecraftVersion: "1.21.1",
  loader: "vanilla" as const,
  memoryMb: 4096,
};
const item = { ...input, id: "instance-1", favorite: false, createdAt: 1 };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
  });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  api.list.mockResolvedValue([item]);
  api.settings.mockResolvedValue({ theme: "system" });
  api.create.mockResolvedValue(item);
});

it("keeps a successful library load when appearance loading fails", async () => {
  api.settings.mockRejectedValue(new Error("Appearance unavailable"));
  const store = useLauncher();
  await store.init();
  expect(store.instances).toEqual([item]);
  expect(store.libraryReady).toBe(true);
  expect(store.settingsError).toBe("Appearance unavailable");
  expect(store.loadError).toBe("");
  expect(await store.save(input)).toEqual(item);
});

it("does not let favourite, appearance or project errors block creation", async () => {
  const store = useLauncher();
  await store.init();
  api.favorite.mockRejectedValue(new Error("Favourite failed"));
  await store.favorite(item.id);
  expect(store.error).toBe("Favourite failed");
  expect(await store.save(input)).toEqual(item);
  api.saveSettings.mockRejectedValue(new Error("Appearance failed"));
  await store.theme("dark");
  expect(store.settingsError).toBe("Appearance failed");
  expect(await store.save(input)).toEqual(item);
  api.openProject.mockRejectedValue(new Error("Browser failed"));
  await store.openProject();
  expect(await store.save(input)).toEqual(item);
});

it("blocks mutations after a failed library load and allows a successful retry", async () => {
  api.list.mockRejectedValueOnce(new Error("Recovery required"));
  const store = useLauncher();
  await store.init();
  expect(store.loadError).toBe("Recovery required");
  await store.save(input);
  await store.favorite(item.id);
  await store.remove(item.id);
  expect(api.create).not.toHaveBeenCalled();
  expect(api.favorite).not.toHaveBeenCalled();
  expect(api.remove).not.toHaveBeenCalled();
  await store.init();
  expect(store.loadError).toBe("");
  expect(store.libraryReady).toBe(true);
  expect(await store.save(input)).toEqual(item);
});

it("keeps failed saves and removals in their own retryable error states", async () => {
  const store = useLauncher();
  await store.init();
  api.update
    .mockRejectedValueOnce(new Error("Save failed"))
    .mockResolvedValue(item);
  const original = { ...input };
  expect(await store.save(input, item.id)).toBeUndefined();
  expect(input).toEqual(original);
  expect(store.saveError).toBe("Save failed");
  expect(store.error).toBe("");
  expect(await store.save(input, item.id)).toEqual(item);
  expect(store.saveError).toBe("");
  api.remove
    .mockRejectedValueOnce(new Error("Removal failed"))
    .mockResolvedValue(undefined);
  expect(await store.remove(item.id)).toBeUndefined();
  expect(store.instances).toEqual([item]);
  expect(store.deleteError).toBe("Removal failed");
  expect(await store.remove(item.id)).toBe(true);
  expect(store.deleteError).toBe("");
  expect(store.instances).toEqual([]);
});

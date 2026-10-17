import { beforeEach, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/api", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
import { useWardrobe } from "../../src/stores/wardrobe";
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
});
it("discards a profile response after account sign-out", async () => {
  let resolve!: (value: unknown) => void;
  mocks.invoke.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const store = useWardrobe();
  const load = store.load("old");
  store.reset();
  resolve({ skin: "old-image", variant: "CLASSIC", capes: [] });
  await load;
  expect(store.profile).toBeNull();
  expect(store.owner).toBe("");
  expect(store.busy).toBe(false);
});
it("changes only the selected account and reloads after success", async () => {
  const profile = { skin: null, variant: "SLIM", capes: [] };
  mocks.invoke
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(profile);
  const store = useWardrobe();
  await store.load("owner");
  await store.change("selectCape", "owner", "owned-cape");
  expect(mocks.invoke).toHaveBeenNthCalledWith(2, "wardrobe_change", {
    action: "selectCape",
    expectedId: "owner",
    capeId: "owned-cape",
  });
  expect(mocks.invoke).toHaveBeenCalledTimes(3);
  await store.change("hideCape", "other");
  expect(mocks.invoke).toHaveBeenCalledTimes(3);
});
it("keeps a cancelled file picker from triggering another request", async () => {
  mocks.invoke
    .mockResolvedValueOnce({ skin: null, variant: "CLASSIC", capes: [] })
    .mockResolvedValueOnce(false);
  const store = useWardrobe();
  await store.load("owner");
  await store.change("uploadClassic", "owner");
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
  expect(store.busy).toBe(false);
});

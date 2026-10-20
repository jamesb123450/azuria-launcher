import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({
  updatePlan: vi.fn(),
  install: vi.fn(),
  job: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../../src/api", () => ({
  desktop: false,
  api: { list: async () => [], settings: async () => ({ theme: "dark" }) },
}));
vi.mock("../../src/content-api", () => ({ contentApi: api }));
import { useContent } from "../../src/stores/content";
const updates = [
  { provider: "modrinth" as const, project: "one", version: "v2", name: "One" },
  {
    provider: "curseforge" as const,
    project: "two",
    version: "v3",
    name: "Two",
  },
];
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true, addEventListener: vi.fn() }),
  });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  let current = "";
  api.updatePlan.mockImplementation(async (_id, _provider, project) => ({
    id: project,
    preview: {},
  }));
  api.install.mockImplementation(async (id) => {
    current = id;
  });
  api.job.mockImplementation(async () => ({
    id: current,
    stage: "installed",
    message: "Updated",
    completed: 1,
    total: 1,
  }));
});
it("plans and installs reviewed versions sequentially", async () => {
  const store = useContent();
  await store.updateBatch("profile", updates);
  expect(api.updatePlan.mock.calls).toEqual([
    ["profile", "modrinth", "one", "v2"],
    ["profile", "curseforge", "two", "v3"],
  ]);
  expect(api.install.mock.calls).toEqual([["one"], ["two"]]);
  expect(store.batchActive).toBe(false);
  expect(store.error).toBe("");
});
it("stops the queue when an update fails", async () => {
  const store = useContent();
  api.job.mockResolvedValue({
    id: "one",
    stage: "error",
    message: "File changed",
    completed: 0,
    total: 1,
  });
  await store.updateBatch("profile", updates);
  expect(api.install).toHaveBeenCalledTimes(1);
  expect(store.error).toContain("0 of 2");
  expect(store.error).toContain("File changed");
});
it("cancellation during planning prevents installation", async () => {
  const store = useContent();
  let finish: (value: unknown) => void = () => {};
  api.updatePlan.mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const work = store.updateBatch("profile", updates);
  await store.cancel();
  finish({ id: "one", preview: {} });
  await work;
  expect(api.install).not.toHaveBeenCalled();
  expect(api.cancel).not.toHaveBeenCalled();
  expect(store.batchActive).toBe(false);
});

import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  settings: vi.fn(),
  create: vi.fn(),
  defaults: vi.fn(),
  versions: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("../../src/api", () => ({
  api: { list: mocks.list, settings: mocks.settings, create: mocks.create },
}));
vi.mock("../../src/instance-api", () => ({
  instanceApi: { defaults: mocks.defaults },
}));
vi.mock("../../src/lib/game-versions", () => ({
  gameVersions: mocks.versions,
}));
vi.mock("../../src/lib/loader-versions", () => ({
  resolveLoaderVersion: mocks.resolve,
}));
import { useQuickPlay } from "../../src/stores/quick-play";
import { useLauncher } from "../../src/stores/launcher";
let data: Map<string, string>;
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true, addEventListener: vi.fn() }),
  });
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  mocks.list.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({ theme: "dark" });
  mocks.defaults.mockResolvedValue({ memoryMb: 6144 });
  mocks.resolve.mockResolvedValue("0.16.10");
  mocks.versions.mockResolvedValue([
    { id: "26w01a", type: "snapshot" },
    { id: "1.21.1", type: "release" },
  ]);
  mocks.create.mockImplementation(async (input) => ({
    ...input,
    id: crypto.randomUUID(),
    favorite: false,
    createdAt: 1,
  }));
});
it("starts with the latest release, preserves an explicit choice and retries catalogue failures", async () => {
  const q = useQuickPlay();
  mocks.versions.mockRejectedValueOnce(Error("offline"));
  await q.load();
  expect(q.error).toContain("Couldn’t load");
  await q.load();
  expect(q.version).toBe("1.21.1");
  q.choose("1.20.1", "fabric");
  setActivePinia(createPinia());
  const restored = useQuickPlay();
  await restored.load();
  expect(restored.version).toBe("1.20.1");
  expect(restored.loader).toBe("fabric");
});
it("creates a separate setup, reuses its id and leaves custom setups untouched", async () => {
  mocks.list.mockResolvedValue([
    {
      id: "custom",
      name: "Minecraft 1.21.1",
      minecraftVersion: "1.21.1",
      loader: "vanilla",
      memoryMb: 4096,
    },
  ]);
  const l = useLauncher();
  await l.init();
  const q = useQuickPlay();
  q.choose("1.21.1");
  const item = await q.ensureSetup();
  expect(item.id).not.toBe("custom");
  expect(item.memoryMb).toBe(6144);
  expect(mocks.create).toHaveBeenLastCalledWith(
    expect.objectContaining({ minecraftVersion: "1.21.1", loader: "vanilla" }),
    false,
  );
  expect((await q.ensureSetup()).id).toBe(item.id);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(q.setup?.id).toBe(item.id);
  expect(l.instances.find((i) => i.id === "custom")?.memoryMb).toBe(4096);
  q.choose("1.21.1", "fabric");
  const fabric = await q.ensureSetup();
  expect(fabric.id).not.toBe(item.id);
  expect(fabric.loaderVersion).toBe("0.16.10");
});
it("deduplicates concurrent creation and pins a stable Fabric loader", async () => {
  await useLauncher().init();
  const q = useQuickPlay();
  q.choose("1.21.1", "fabric");
  const [a, b] = await Promise.all([q.ensureSetup(), q.ensureSetup()]);
  expect(a.id).toBe(b.id);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.resolve).toHaveBeenCalledWith("fabric", "1.21.1", "stable");
});
it("does not create while recovery is required; retries failed preparation without a duplicate", async () => {
  const l = useLauncher();
  await l.init();
  l.libraryReady = false;
  const q = useQuickPlay();
  q.choose("1.21.1", "fabric");
  await expect(q.ensureSetup()).rejects.toThrow("not ready");
  expect(mocks.create).not.toHaveBeenCalled();
  l.libraryReady = true;
  mocks.resolve.mockRejectedValueOnce(Error("Loader offline"));
  await expect(q.ensureSetup()).rejects.toThrow("Loader offline");
  expect(q.preparing).toBe(false);
  expect(mocks.create).not.toHaveBeenCalled();
  await q.ensureSetup();
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("creates a new setup after deletion or metadata changes without hijacking a custom setup", async () => {
  const l = useLauncher();
  await l.init();
  const q = useQuickPlay();
  q.choose("1.21.1");
  const a = await q.ensureSetup();
  l.instances[0]!.minecraftVersion = "1.20.1";
  expect(q.setup).toBeUndefined();
  const b = await q.ensureSetup();
  expect(b.id).not.toBe(a.id);
  l.instances = l.instances.filter((i) => i.id !== b.id);
  const c = await q.ensureSetup();
  expect(c.id).not.toBe(b.id);
});
it("restores the automatic setup id across app sessions", async () => {
  const launcher = useLauncher();
  await launcher.init();
  const first = useQuickPlay();
  first.choose("1.21.1");
  const item = await first.ensureSetup();
  setActivePinia(createPinia());
  mocks.list.mockResolvedValue([item]);
  await useLauncher().init();
  const restored = useQuickPlay();
  expect(restored.setup?.id).toBe(item.id);
  expect((await restored.ensureSetup()).id).toBe(item.id);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it("keeps an explicitly selected modpack across sessions without replacing an automatic setup", async () => {
  const launcher = useLauncher();
  await launcher.init();
  const q = useQuickPlay();
  q.choose("1.21.1", "fabric");
  const automatic = await q.ensureSetup();
  const pack = { ...automatic, id: "modpack", name: "Forest adventure" };
  launcher.instances.push(pack);
  q.adoptSetup(pack);
  expect((await q.ensureSetup()).id).toBe("modpack");
  expect(q.profileSelected).toBe(true);
  setActivePinia(createPinia());
  mocks.list.mockResolvedValue([automatic, pack]);
  await useLauncher().init();
  const restored = useQuickPlay();
  expect(restored.setup?.name).toBe("Forest adventure");
  restored.choose("1.21.1", "fabric");
  expect(restored.setup?.id).toBe(automatic.id);
  expect(restored.profileSelected).toBe(false);
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("does not create a replacement when a selected modpack is removed", async () => {
  const launcher = useLauncher();
  await launcher.init();
  const q = useQuickPlay();
  const pack = {
    id: "pack",
    name: "Forest",
    loader: "fabric" as const,
    minecraftVersion: "1.21.1",
    memoryMb: 4096,
    favorite: false,
    createdAt: 1,
  };
  launcher.instances.push(pack);
  q.adoptSetup(pack);
  launcher.instances = [];
  await expect(q.ensureSetup()).rejects.toThrow("no longer available");
  expect(mocks.create).not.toHaveBeenCalled();
});

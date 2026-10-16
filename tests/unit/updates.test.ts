import { beforeEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  invoke: vi.fn(),
  version: vi.fn(),
}));
vi.mock("../../src/api", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.version }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
import { useUpdates } from "../../src/stores/updates";
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocks.version.mockResolvedValue("0.2.3");
  mocks.invoke.mockResolvedValue([]);
});
describe("automatic desktop updates", () => {
  it("checks once per startup, downloads automatically and verifies before restart", async () => {
    const install = vi.fn();
    const download = vi.fn(async (onEvent: (e: unknown) => void) => {
      expect(install).not.toHaveBeenCalled();
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 100 } });
      onEvent({ event: "Finished" });
    });
    mocks.check.mockResolvedValue({ version: "0.2.4", download, install });
    const s = useUpdates();
    await s.init();
    await s.init();
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
    expect(s.status).toBe("ready");
    expect(s.progress).toBe(100);
    expect(install).not.toHaveBeenCalled();
    await s.install();
    expect(install).toHaveBeenCalledWith({ restartAfterInstall: true });
  });
  it("never installs a failed signature and retries with a fresh resource", async () => {
    const install = vi.fn();
    const download = vi
      .fn()
      .mockRejectedValueOnce(Error("signature"))
      .mockResolvedValue(undefined);
    const close = vi.fn();
    mocks.check.mockResolvedValue({
      version: "0.2.4",
      download,
      install,
      close,
    });
    const s = useUpdates();
    await s.init();
    await s.install();
    expect(install).not.toHaveBeenCalled();
    expect(s.status).toBe("error");
    await s.checkNow();
    expect(close).toHaveBeenCalledOnce();
    expect(s.status).toBe("ready");
    await s.install();
    expect(install).toHaveBeenCalledOnce();
  });
  it("allows postponing a verified restart without repeating the download", async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const install = vi.fn();
    mocks.check.mockResolvedValue({ version: "0.2.4", download, install });
    const s = useUpdates();
    await s.init();
    s.defer();
    expect(s.deferred).toBe(true);
    expect(s.status).toBe("ready");
    expect(install).not.toHaveBeenCalled();
    await s.install();
    expect(download).toHaveBeenCalledOnce();
    expect(install).toHaveBeenCalledOnce();
  });
  it("reports feed errors and prevents overlapping checks", async () => {
    let resolve!: (v: unknown) => void;
    mocks.check.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const s = useUpdates();
    const first = s.checkNow();
    await s.checkNow();
    expect(mocks.check).toHaveBeenCalledOnce();
    resolve(null);
    await first;
    expect(s.status).toBe("current");
    mocks.check.mockRejectedValue(Error("offline"));
    await s.checkNow();
    expect(s.status).toBe("error");
    expect(s.error).toContain("not be published");
  });
});

it("postpones installer execution while Minecraft is active", async () => {
  const install = vi.fn();
  mocks.check.mockResolvedValue({
    version: "0.2.4",
    download: vi.fn().mockResolvedValue(undefined),
    install,
  });
  mocks.invoke.mockResolvedValue([{ stage: "running" }]);
  const store = useUpdates();
  await store.init();
  await store.install();
  expect(install).not.toHaveBeenCalled();
  expect(store.status).toBe("ready");
  expect(store.deferred).toBe(true);
  expect(store.error).toContain("Close Minecraft");
});

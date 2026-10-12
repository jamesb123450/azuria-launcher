import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const mocks = vi.hoisted(() => ({ check: vi.fn(), version: vi.fn() }));
vi.mock("../../src/api", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.version }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
import { useUpdates } from "../../src/stores/updates";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocks.version.mockResolvedValue("0.2.3");
});
describe("desktop updates", () => {
  it("does not report an unavailable feed as current", async () => {
    mocks.check.mockRejectedValue(new Error("404"));
    const store = useUpdates();
    await store.init();
    expect(store.version).toBe("0.2.3");
    expect(store.status).toBe("error");
    expect(store.error).toContain("not be published");
  });
  it("prevents concurrent checks and releases superseded resources", async () => {
    let resolve!: (v: unknown) => void;
    mocks.check.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const store = useUpdates();
    const first = store.checkNow();
    await store.checkNow();
    expect(mocks.check).toHaveBeenCalledTimes(1);
    const close = vi.fn();
    resolve({ version: "0.2.4", close });
    await first;
    mocks.check.mockResolvedValue(null);
    await store.checkNow();
    expect(close).toHaveBeenCalledOnce();
    expect(store.status).toBe("current");
  });
  it("waits for verified download before installing and tracks bytes", async () => {
    const install = vi.fn();
    const download = vi.fn(async (onEvent: (e: unknown) => void) => {
      expect(install).not.toHaveBeenCalled();
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 50 } });
    });
    mocks.check.mockResolvedValue({ version: "0.2.4", download, install });
    const store = useUpdates();
    await store.checkNow();
    expect(download).not.toHaveBeenCalled();
    await store.install();
    expect(store.progress).toBe(50);
    expect(install).toHaveBeenCalledWith({ restartAfterInstall: true });
  });
  it("never installs after a download or signature failure and allows retry", async () => {
    const install = vi.fn();
    const download = vi.fn().mockRejectedValueOnce(new Error("signature"));
    mocks.check.mockResolvedValue({ version: "0.2.4", download, install });
    const store = useUpdates();
    await store.checkNow();
    await store.install();
    expect(install).not.toHaveBeenCalled();
    expect(store.status).toBe("error");
    download.mockResolvedValue(undefined);
    await store.install();
    expect(install).toHaveBeenCalledOnce();
  });
});

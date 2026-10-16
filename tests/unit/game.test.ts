import { beforeEach, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("../../src/api", () => ({ desktop: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
import { useGame } from "../../src/stores/game";
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocks.listen.mockResolvedValue(() => {});
  mocks.invoke.mockResolvedValue([]);
});
it("restores native running state before allowing another launch", async () => {
  mocks.invoke.mockResolvedValue([
    {
      id: "one",
      stage: "running",
      message: "Running",
      completed: 0,
      total: 0,
      exitCode: null,
    },
  ]);
  const store = useGame();
  await store.init();
  await store.launch("one");
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(store.active).toHaveLength(1);
});
it("keeps native launch failures actionable and allows a retry", async () => {
  const store = useGame();
  await store.init();
  mocks.invoke.mockRejectedValueOnce("Minecraft access denied");
  await store.launch("one");
  expect(store.launches.one?.stage).toBe("error");
  expect(store.launches.one?.message).toContain("access denied");
  mocks.invoke.mockResolvedValueOnce(undefined);
  await store.launch("one");
  expect(store.launches.one?.stage).toBe("queued");
  expect(store.active).toHaveLength(1);
  await store.launch("one");
  expect(mocks.invoke).toHaveBeenCalledTimes(3);
});

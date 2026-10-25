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

it("prepares files without launching, and treats prepared as an idle state", async () => {
  const store = useGame();
  await store.init();
  await store.prepare("one");
  expect(mocks.invoke).toHaveBeenLastCalledWith("prepare_instance", {
    id: "one",
  });
  expect(store.launches.one?.prepareOnly).toBe(true);
  expect(mocks.invoke).not.toHaveBeenCalledWith(
    "launch_instance",
    expect.anything(),
  );
  const callback = mocks.listen.mock.calls.find(
    ([name]) => name === "game-progress",
  )?.[1];
  callback({
    payload: {
      id: "one",
      stage: "prepared",
      prepareOnly: true,
      message: "Files ready",
      completed: 0,
      total: 0,
      exitCode: null,
    },
  });
  expect(store.active).toHaveLength(0);
  await store.launch("one");
  expect(mocks.invoke).toHaveBeenLastCalledWith("launch_instance", {
    id: "one",
  });
});

it("records recent play only once Minecraft reaches running, never for preparation", async () => {
  const { useRecentPlay } = await import("../../src/stores/recent-play");
  const store = useGame();
  await store.init();
  const history = useRecentPlay();
  const remember = vi.spyOn(history, "remember");
  const callback = mocks.listen.mock.calls.find(
    ([name]) => name === "game-progress",
  )?.[1];
  const progress = (stage: string, prepareOnly = false) =>
    callback({
      payload: {
        id: "one",
        stage,
        prepareOnly,
        message: stage,
        completed: 0,
        total: 0,
        exitCode: null,
      },
    });
  progress("preparing");
  progress("prepared", true);
  expect(remember).not.toHaveBeenCalled();
  progress("running");
  progress("running");
  expect(remember).toHaveBeenCalledExactlyOnceWith("one");
});

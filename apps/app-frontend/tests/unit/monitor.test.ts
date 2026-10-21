import { beforeEach, expect, it, vi } from "vitest";
import type { Router } from "vue-router";
const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke }));
vi.mock("../../src/api", () => ({ desktop: true }));
import { launchMonitored } from "../../src/monitor";
beforeEach(() => vi.resetAllMocks());
it("opens the selected profile monitor before invoking its launch sequence", async () => {
  const calls: string[] = [];
  native.invoke.mockImplementation(async (command: string) => {
    calls.push(command);
  });
  const start = vi.fn(async (id: string) => {
    calls.push(`launch:${id}`);
  });
  await launchMonitored("profile-a", {} as Router, start);
  expect(native.invoke).toHaveBeenCalledWith("open_game_monitor", {
    id: "profile-a",
  });
  expect(calls).toEqual(["open_game_monitor", "launch:profile-a"]);
});
it("waits for monitor creation and does not launch when the monitor fails", async () => {
  let finish!: (value: void) => void;
  native.invoke.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const start = vi.fn().mockResolvedValue(undefined);
  const pending = launchMonitored("profile-b", {} as Router, start);
  expect(start).not.toHaveBeenCalled();
  finish();
  await pending;
  expect(start).toHaveBeenCalledWith("profile-b");
  start.mockClear();
  native.invoke.mockRejectedValueOnce(new Error("window unavailable"));
  await expect(
    launchMonitored("profile-b", {} as Router, start),
  ).rejects.toThrow("window unavailable");
  expect(start).not.toHaveBeenCalled();
});

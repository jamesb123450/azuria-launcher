import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
vi.mock("../../src/api", () => ({ desktop: false }));
import { useActivity } from "../../src/stores/activity";
import { useGame } from "../../src/stores/game";
import { useContent } from "../../src/stores/content";
const launch = (stage: string, completed = 0) => ({
  id: "one",
  stage,
  message: stage,
  completed,
  total: 10,
  exitCode: null,
});
beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: true, addEventListener: vi.fn() }),
  });
});
it("keeps completed tasks after native status changes and does not restore dismissed history", async () => {
  const activity = useActivity(),
    game = useGame();
  activity.init();
  game.launches.one = launch("assets", 5);
  await nextTick();
  expect(activity.active[0]?.progress).toBe(50);
  game.launches.one = launch("prepared", 10);
  await nextTick();
  expect(activity.finished).toHaveLength(1);
  expect(activity.unread).toBe(1);
  activity.clearFinished();
  game.launches.two = { ...launch("assets", 2), id: "two" };
  await nextTick();
  expect(activity.tasks.map((t) => t.key)).toEqual(["game:two"]);
  game.launches.one = launch("queued");
  await nextTick();
  expect(activity.active).toHaveLength(2);
  activity.remove("game:one");
  expect(activity.active).toHaveLength(2);
  activity.markRead();
  expect(activity.unread).toBe(0);
});
it("retains content results after their toast is dismissed", async () => {
  const activity = useActivity(),
    content = useContent();
  activity.init();
  content.job = {
    id: "pack",
    stage: "downloading",
    message: "Downloading pack",
    completed: 2,
    total: 4,
  };
  await nextTick();
  expect(activity.active[0]?.kind).toBe("content");
  content.job = {
    ...content.job,
    stage: "installed",
    message: "Pack installed",
  };
  await nextTick();
  content.job = null;
  await nextTick();
  expect(activity.finished[0]?.message).toBe("Pack installed");
  expect(activity.notifications[0]?.message).toContain("Pack installed");
});

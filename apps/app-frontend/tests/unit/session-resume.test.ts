import { expect, it, vi } from "vitest";
import { sessionResume } from "../../src/lib/session-resume";
it("retries only eligible saved sessions, throttles event bursts and cleans up", async () => {
  const target = new EventTarget(),
    retry = vi.fn().mockResolvedValue(undefined);
  let eligible = false;
  const stop = sessionResume(() => eligible, retry, target);
  target.dispatchEvent(new Event("focus"));
  expect(retry).not.toHaveBeenCalled();
  eligible = true;
  target.dispatchEvent(new Event("online"));
  target.dispatchEvent(new Event("focus"));
  expect(retry).toHaveBeenCalledTimes(1);
  stop();
  target.dispatchEvent(new Event("online"));
  expect(retry).toHaveBeenCalledTimes(1);
});

import { expect, it } from "vitest";
import { logLines, visibleLog } from "../../src/utils/log-lines";
it("keeps multiline errors together and recognises Minecraft log levels", () => {
  const result = logLines(
    "[12:00:01] [Render thread/INFO]: Ready\r\n[12:00:02] [main/ERROR]: Failed\n  at example.Main.run(Main.java:4)\n[main/WARN]: Retry\n[main/DEBUG]: detail",
  );
  expect(result.map((line) => line.level)).toEqual([
    "info",
    "error",
    "error",
    "warn",
    "debug",
  ]);
  expect(result[2]?.message).toBe("  at example.Main.run(Main.java:4)");
});
it("clears only the current display and resumes when the bounded tail rotates", () => {
  expect(visibleLog("old\nnew", "old")).toBe("new");
  expect(visibleLog("old", "old")).toBe("");
  expect(visibleLog("rotated\nnew", "old")).toBe("rotated\nnew");
});

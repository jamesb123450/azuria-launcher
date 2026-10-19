import { expect, it } from "vitest";
import { defaultBehaviour, parseBehaviour } from "../../src/behaviour-api";
it("old preferences gain safe defaults without coercing invalid values", () => {
  expect(parseBehaviour({})).toEqual(defaultBehaviour());
  expect(parseBehaviour({ hideRightSidebar: true })).toEqual({
    ...defaultBehaviour(),
    hideRightSidebar: true,
  });
  for (const value of [
    null,
    [],
    { compactLibrary: "true" },
    { discordPresence: 1 },
  ])
    expect(() => parseBehaviour(value)).toThrow();
});

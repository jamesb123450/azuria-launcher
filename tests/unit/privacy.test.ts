import { expect, it } from "vitest";
import { parsePrivacy, defaultPrivacy } from "../../src/privacy-api";
it("defaults missing privacy fields but rejects invalid saved values", () => {
  expect(parsePrivacy({})).toEqual(defaultPrivacy());
  expect(parsePrivacy({ restoreAccount: false })).toEqual({
    restoreAccount: false,
    hideAccount: false,
  });
  for (const value of [
    null,
    [],
    { hideAccount: "true" },
    { restoreAccount: 1 },
  ])
    expect(() => parsePrivacy(value)).toThrow();
});

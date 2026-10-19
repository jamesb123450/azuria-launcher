import { expect, it } from "vitest";
// @ts-expect-error Node publishing helper has no TypeScript declarations.
import { publicationError } from "../publication-errors.mjs";
it("identifies authentication and branch failures without exposing subprocess output", () => {
  const secret = "private-token-sentinel";
  expect(
    publicationError("clone", {
      status: 128,
      stderr: `Authentication failed ${secret}`,
    }),
  ).toContain("GitHub rejected the token");
  expect(
    publicationError("push", {
      status: 1,
      stderr: "GH013: repository rule violation",
    }),
  ).toContain("branch rule");
  expect(
    publicationError("push", { status: 1, stderr: "non-fast-forward" }),
  ).toContain("Rerun");
  expect(
    publicationError("clone", {
      status: 128,
      stderr: `unknown error ${secret}`,
    }),
  ).not.toContain(secret);
});

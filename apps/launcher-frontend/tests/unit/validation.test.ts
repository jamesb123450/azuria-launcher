import { describe, expect, it } from "vitest";
import { validateInput } from "../../src/types";
const valid = {
  name: "My world",
  minecraftVersion: "1.21.1",
  loader: "fabric" as const,
  memoryMb: 4096,
};
describe("instance input boundaries", () => {
  it("accepts release and snapshot IDs", () => {
    expect(validateInput(valid)).toBeNull();
    expect(validateInput({ ...valid, minecraftVersion: "24w14a" })).toBeNull();
  });
  it("rejects unsafe paths and empty names", () => {
    expect(
      validateInput({ ...valid, minecraftVersion: "../escape" }),
    ).toBeTruthy();
    expect(validateInput({ ...valid, name: " " })).toBeTruthy();
  });
  it("rejects unsupported memory allocations", () => {
    for (const memoryMb of [0, 511, 513, 65537, NaN])
      expect(validateInput({ ...valid, memoryMb })).toBeTruthy();
  });
});

it("accepts every setup loader and rejects unsafe icon/version data", () => {
  for (const loader of [
    "vanilla",
    "fabric",
    "neoforge",
    "forge",
    "quilt",
  ] as const) {
    expect(
      validateInput({
        name: "World",
        minecraftVersion: "1.21.1",
        memoryMb: 4096,
        loader,
        loaderVersion: "stable",
      }),
    ).toBeNull();
  }
  const input = {
    name: "World",
    minecraftVersion: "1.21.1",
    memoryMb: 4096,
    loader: "fabric" as const,
  };
  expect(
    validateInput({ ...input, icon: "data:image/svg+xml;base64,PHN2Zz4=" }),
  ).toBeTruthy();
  expect(validateInput({ ...input, loaderVersion: "../loader" })).toBeTruthy();
  expect(validateInput({ ...input, loaderVersion: "" })).toBeTruthy();
});

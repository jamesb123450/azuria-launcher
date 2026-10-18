import { expect, it } from "vitest";
import {
  defaultResources,
  fileSize,
  resourceValidation,
} from "../../src/resource-api";
it("validates resource limits before saving", () => {
  expect(resourceValidation(defaultResources())).toBe("");
  expect(
    resourceValidation({ unusedDownloadGib: 0, concurrentDownloads: 1 }),
  ).toBe("");
  for (const value of [-1, 101, NaN, 2.5])
    expect(
      resourceValidation({ unusedDownloadGib: value, concurrentDownloads: 8 }),
    ).not.toBe("");
  for (const value of [0, 11, Infinity, 1.5])
    expect(
      resourceValidation({ unusedDownloadGib: 5, concurrentDownloads: value }),
    ).not.toBe("");
});
it("formats measured file bytes with binary units", () => {
  expect(fileSize(0)).toBe("0 B");
  expect(fileSize(1024)).toBe("1 KiB");
  expect(fileSize(5 * 1024 ** 3)).toBe("5 GiB");
});

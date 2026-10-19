import { expect, it } from "vitest";
import { groupVersionSeries } from "../../src/lib/version-series";
it("groups patches by release family without treating 26 drops as 1.x releases or grouping snapshots", () => {
  const groups = groupVersionSeries([
    { id: "26.3", type: "release" },
    { id: "26.2", type: "release" },
    { id: "1.21.11", type: "release" },
    { id: "1.21.1", type: "release" },
    { id: "26w01a", type: "snapshot" },
    { id: "26w02a", type: "snapshot" },
    { id: "1.20.1", type: "release" },
    { id: "b1.7.3", type: "old_beta" },
  ]);
  expect(groups.map((g) => g.id)).toEqual([
    "26",
    "1.21",
    "26w01a",
    "26w02a",
    "1.20",
    "b1.7.3",
  ]);
  expect(groups[0].versions.map((v) => v.id)).toEqual(["26.3", "26.2"]);
  expect(groups[1].versions.map((v) => v.id)).toEqual(["1.21.11", "1.21.1"]);
});

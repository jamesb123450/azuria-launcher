import { it, expect } from "vitest";
import { skinBoxes, boxFaces } from "../../src/lib/skin-model";
it("uses six body parts and six separate outer layers", () => {
  const boxes = skinBoxes(false);
  expect(boxes).toHaveLength(12);
  expect(boxes.filter((b) => b.inflate)).toHaveLength(6);
  expect(boxFaces(boxes[0]!)).toHaveLength(6);
});
it("slim arms change geometry without changing the head or legs", () => {
  const classic = skinBoxes(false),
    slim = skinBoxes(true);
  expect(slim[2]!.w).toBe(3);
  expect(classic[2]!.w).toBe(4);
  expect(slim[2]!.x).toBe(-5.5);
  expect(slim[0]).toEqual(classic[0]);
  expect(slim[4]).toEqual(classic[4]);
});
it("maps the head front and back to their own atlas regions", () => {
  const faces = boxFaces(skinBoxes(false)[0]!);
  expect(faces[0]).toMatchObject({ u: 8, v: 8, w: 8, h: 8 });
  expect(faces[1]).toMatchObject({ u: 24, v: 8, w: 8, h: 8 });
});

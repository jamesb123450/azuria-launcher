export interface SkinBox {
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  u: number;
  v: number;
  inflate?: number;
}
export function skinBoxes(slim: boolean): SkinBox[] {
  const arm = slim ? 3 : 4;
  const base: SkinBox[] = [
    { name: "head", x: 0, y: 4, z: 0, w: 8, h: 8, d: 8, u: 0, v: 0 },
    { name: "body", x: 0, y: 14, z: 0, w: 8, h: 12, d: 4, u: 16, v: 16 },
    {
      name: "right arm",
      x: -4 - arm / 2,
      y: 14,
      z: 0,
      w: arm,
      h: 12,
      d: 4,
      u: 40,
      v: 16,
    },
    {
      name: "left arm",
      x: 4 + arm / 2,
      y: 14,
      z: 0,
      w: arm,
      h: 12,
      d: 4,
      u: 32,
      v: 48,
    },
    { name: "right leg", x: -2, y: 26, z: 0, w: 4, h: 12, d: 4, u: 0, v: 16 },
    { name: "left leg", x: 2, y: 26, z: 0, w: 4, h: 12, d: 4, u: 16, v: 48 },
  ];
  const uv = [
    [32, 0],
    [16, 32],
    [40, 32],
    [48, 48],
    [0, 32],
    [0, 48],
  ];
  return [
    ...base,
    ...base.map((b, i) => ({
      ...b,
      name: `${b.name} overlay`,
      u: uv[i]![0]!,
      v: uv[i]![1]!,
      inflate: i === 0 ? 0.5 : 0.25,
    })),
  ];
}
export function boxFaces(b: SkinBox) {
  const { u, v, w, h, d } = b;
  const i = b.inflate ?? 0;
  return [
    {
      name: "front",
      u: u + d,
      v: v + d,
      w,
      h,
      transform: `translateZ(${(d / 2 + i) * 5}px)`,
    },
    {
      name: "back",
      u: u + d + w + d,
      v: v + d,
      w,
      h,
      transform: `rotateY(180deg) translateZ(${(d / 2 + i) * 5}px)`,
    },
    {
      name: "right",
      u: u + d + w,
      v: v + d,
      w: d,
      h,
      transform: `rotateY(90deg) translateZ(${(w / 2 + i) * 5}px)`,
    },
    {
      name: "left",
      u,
      v: v + d,
      w: d,
      h,
      transform: `rotateY(-90deg) translateZ(${(w / 2 + i) * 5}px)`,
    },
    {
      name: "top",
      u: u + d,
      v,
      w,
      h: d,
      transform: `rotateX(90deg) translateZ(${(h / 2 + i) * 5}px)`,
    },
    {
      name: "bottom",
      u: u + d + w,
      v,
      w,
      h: d,
      transform: `rotateX(-90deg) translateZ(${(h / 2 + i) * 5}px)`,
    },
  ];
}

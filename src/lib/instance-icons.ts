// Rasterize every icon to a small PNG. Uploaded SVG/HTML never reaches storage.
export const ICON_COLORS = [
  "#b9a4ed",
  "#8aace8",
  "#e5a1c8",
  "#dfac7d",
  "#78b6b0",
  "#a4b77c",
  "#647cbd",
  "#c55c8d",
  "#d28a52",
  "#459fba",
  "#8068b5",
  "#5e966d",
];
export const ICON_GLYPHS = [
  "cube",
  "mountain",
  "moon",
  "star",
  "tree",
  "bolt",
  "gem",
  "portal",
  "sun",
] as const;
export type IconGlyph = (typeof ICON_GLYPHS)[number];

export const ICON_STYLES = ["glow", "solid", "split", "grid"] as const;
export type IconStyle = (typeof ICON_STYLES)[number];
export function makeIcon(
  color: string,
  glyph: IconGlyph,
  style: IconStyle = "glow",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your device could not create an icon.");
  context.fillStyle = color;
  context.fillRect(0, 0, 128, 128);
  if (style === "glow") {
    const gradient = context.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, "#ffffff18");
    gradient.addColorStop(1, "#17182dcc");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  if (style === "split") {
    context.fillStyle = "#17182d66";
    context.beginPath();
    context.moveTo(128, 0);
    context.lineTo(128, 128);
    context.lineTo(0, 128);
    context.fill();
  }
  if (style === "grid") {
    context.fillStyle = "#17182d55";
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#ffffff20";
    context.lineWidth = 1;
    for (let n = 0; n < 128; n += 16) {
      context.beginPath();
      context.moveTo(n, 0);
      context.lineTo(n, 128);
      context.moveTo(0, n);
      context.lineTo(128, n);
      context.stroke();
    }
  }

  context.fillStyle = "#171b30";
  context.globalAlpha = 0.15;
  context.beginPath();
  context.arc(110, 110, style === "solid" ? 0 : 80, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = "#fff";
  if (glyph === "cube") {
    for (const [points, alpha] of [
      [[64, 23, 101, 44, 64, 65, 27, 44], 0.95],
      [[27, 44, 64, 65, 64, 106, 27, 85], 0.7],
      [[64, 65, 101, 44, 101, 85, 64, 106], 0.45],
    ] as const) {
      context.globalAlpha = alpha;
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2)
        context.lineTo(points[i]!, points[i + 1]!);
      context.closePath();
      context.fill();
    }
  } else if (glyph === "mountain") {
    context.beginPath();
    context.moveTo(18, 98);
    context.lineTo(58, 30);
    context.lineTo(80, 67);
    context.lineTo(92, 49);
    context.lineTo(116, 98);
    context.closePath();
    context.fill();
  } else if (glyph === "moon") {
    context.beginPath();
    context.arc(64, 64, 36, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(81, 49, 32, 0, Math.PI * 2);
    context.fill();
  } else {
    context.globalAlpha = 1;
    context.strokeStyle = "#fff";
    context.lineWidth = 8;
    context.lineJoin = "round";
    if (glyph === "sun") {
      context.beginPath();
      context.arc(64, 64, 22, 0, Math.PI * 2);
      context.fill();
      for (let n = 0; n < 8; n++) {
        const angle = (n * Math.PI) / 4;
        context.beginPath();
        context.moveTo(64 + Math.cos(angle) * 32, 64 + Math.sin(angle) * 32);
        context.lineTo(64 + Math.cos(angle) * 43, 64 + Math.sin(angle) * 43);
        context.stroke();
      }
    } else if (glyph === "portal") {
      context.strokeRect(36, 24, 56, 82);
      context.globalAlpha = 0.25;
      context.fillRect(48, 36, 32, 58);
    } else {
      const points =
        glyph === "tree"
          ? [
              [64, 20],
              [100, 72],
              [81, 72],
              [105, 96],
              [72, 96],
              [72, 112],
              [56, 112],
              [56, 96],
              [23, 96],
              [47, 72],
              [28, 72],
            ]
          : glyph === "bolt"
            ? [
                [72, 15],
                [30, 74],
                [60, 74],
                [54, 115],
                [102, 55],
                [71, 55],
              ]
            : glyph === "gem"
              ? [
                  [40, 27],
                  [88, 27],
                  [109, 53],
                  [64, 108],
                  [19, 53],
                ]
              : Array.from({ length: 10 }, (_, i) => {
                  const angle = (i * Math.PI) / 5 - Math.PI / 2;
                  const r = i % 2 ? 19 : 43;
                  return [64 + Math.cos(angle) * r, 64 + Math.sin(angle) * r];
                });
      context.beginPath();
      points.forEach(([x, y], i) =>
        i ? context.lineTo(x!, y!) : context.moveTo(x!, y!),
      );
      context.closePath();
      context.fill();
    }
  }
  return canvas.toDataURL("image/png");
}

export async function uploadIcon(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose an image smaller than 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your device could not read the image.");
    const size = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - size) / 2,
      (bitmap.height - size) / 2,
      size,
      size,
      0,
      0,
      128,
      128,
    );
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}

// Rasterize every icon to a small PNG. Uploaded SVG/HTML never reaches storage.
export const ICON_COLORS = [
  "#b9a4ed",
  "#8aace8",
  "#e5a1c8",
  "#dfac7d",
  "#78b6b0",
  "#a4b77c",
];
export const ICON_GLYPHS = ["cube", "mountain", "moon"] as const;
export type IconGlyph = (typeof ICON_GLYPHS)[number];

export function makeIcon(color: string, glyph: IconGlyph): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your device could not create an icon.");
  context.fillStyle = color;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "#171b30";
  context.globalAlpha = 0.15;
  context.beginPath();
  context.arc(110, 110, 80, 0, Math.PI * 2);
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
  } else {
    context.beginPath();
    context.arc(64, 64, 36, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = color;
    context.beginPath();
    context.arc(81, 49, 32, 0, Math.PI * 2);
    context.fill();
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

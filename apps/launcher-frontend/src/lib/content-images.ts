export function contentImage(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        "cdn.modrinth.com",
        "media.forgecdn.net",
        "mediafilez.forgecdn.net",
        "edge.forgecdn.net",
      ].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

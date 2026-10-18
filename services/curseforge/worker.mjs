// The API key exists only as a Worker secret, never in the distributed launcher.
const MAX_BYTES = 16 * 1024 * 1024;
const error = (status, message) =>
  Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
export function target(request) {
  const url = new URL(request.url);
  if (url.href.length > 2048) return null;
  if (request.method === "POST") {
    return /^\/v1\/mods(?:\/files)?$/.test(url.pathname) && !url.search
      ? new URL(url.pathname, "https://api.curseforge.com")
      : null;
  }
  if (request.method !== "GET") return null;
  if (
    !/^\/v1\/(?:categories|mods\/search|mods\/[1-9]\d{0,11}(?:\/description|\/files(?:\/[1-9]\d{0,11}(?:\/changelog|\/download-url)?)?)?)$/.test(
      url.pathname,
    )
  )
    return null;
  const allowed = new Set([
    "gameId",
    "classId",
    "categoryId",
    "searchFilter",
    "index",
    "pageSize",
    "sortOrder",
    "sortField",
    "gameVersion",
    "modLoaderType",
    "classesOnly",
  ]);
  for (const [key, value] of url.searchParams) {
    if (
      !allowed.has(key) ||
      url.searchParams.getAll(key).length !== 1 ||
      value.length > 256
    )
      return null;
    if (
      [
        "index",
        "pageSize",
        "classId",
        "categoryId",
        "sortField",
        "modLoaderType",
      ].includes(key) &&
      !/^\d{1,6}$/.test(value)
    )
      return null;
  }
  if (
    Number(url.searchParams.get("pageSize") ?? 24) > 50 ||
    Number(url.searchParams.get("index") ?? 0) > 10000
  )
    return null;
  if (
    ["/v1/categories", "/v1/mods/search"].includes(url.pathname) &&
    url.searchParams.get("gameId") !== "432"
  )
    return null;
  return new URL(url.pathname + url.search, "https://api.curseforge.com");
}
export async function handle(request, env, fetcher = fetch) {
  const upstream = target(request);
  if (!upstream) return error(400, "Unsupported content request.");
  if (!env.CURSEFORGE_API_KEY || !env.CONTENT_LIMIT)
    return error(503, "Content service is not configured.");
  try {
    // Public desktop clients cannot keep a shared proxy password secret. Bound use
    // per Cloudflare-verified client address; shared networks may share this quota.
    const { success } = await env.CONTENT_LIMIT.limit({
      key: request.headers.get("CF-Connecting-IP") ?? "unknown",
    });
    if (!success) return error(429, "Retry shortly.");
    let body;
    if (request.method === "POST") {
      if (!request.body) return error(400, "Missing content IDs.");
      const reader = request.body.getReader();
      let text = "";
      let length = 0;
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 65536) {
            await reader.cancel();
            return error(413, "Too many content IDs.");
          }
          text += decoder.decode(value, { stream: true });
        }
      } finally {
        reader.releaseLock();
      }
      let value;
      try {
        value = JSON.parse(text + decoder.decode());
      } catch {
        return error(400, "Invalid content IDs.");
      }
      const key = upstream.pathname === "/v1/mods" ? "modIds" : "fileIds";
      const ids = value?.[key];
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 1000 ||
        !ids.every((id) => Number.isSafeInteger(id) && id > 0) ||
        Object.keys(value).length !== 1
      )
        return error(400, "Invalid content IDs.");
      body = JSON.stringify({ [key]: ids });
    }
    const response = await fetcher(upstream, {
      method: request.method,
      body,
      headers: {
        "x-api-key": env.CURSEFORGE_API_KEY,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      return error(
        response.status === 429 ? 429 : response.status === 404 ? 404 : 502,
        "Content provider unavailable.",
      );
    if (
      !(response.headers.get("Content-Type") ?? "").includes(
        "application/json",
      ) ||
      !response.body
    )
      return error(502, "Invalid content response.");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return error(502, "Content response too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Parse before returning; error text and upstream headers can never leak keys.
    const value = JSON.parse(new TextDecoder().decode(bytes));
    return Response.json(value, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return error(502, "Content service unavailable. Retry later.");
  }
}
export default { fetch: (request, env) => handle(request, env) };

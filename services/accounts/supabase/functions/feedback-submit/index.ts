import { createClient } from "npm:@supabase/supabase-js@2.118.0";
// Public endpoint. No account token, IP address, user agent or challenge token is
// written to survey responses. Turnstile is checked before any database write.
export async function handleRequest(request: Request): Promise<Response> {
  const origins = (
    Deno.env.get("AZURIA_FEEDBACK_ORIGINS") ||
    "https://azuriasmp.org,https://www.azuriasmp.org"
  )
    .split(",")
    .map((s) => s.trim());
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && origins.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin))
    return reply(403, { error: "Origin not allowed." });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });
  const secret = Deno.env.get("AZURIA_TURNSTILE_SECRET_KEY");
  if (!secret) return reply(503, { error: "Survey unavailable." });
  try {
    // Enforce the limit while streaming; Content-Length alone is untrusted.
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { error: "Missing answers." });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return reply(413, { error: "Request too large." });
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
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (
      !body ||
      Array.isArray(body) ||
      Object.keys(body).sort().join(",") !==
        "answers,submissionId,token,version" ||
      body.version !== 1 ||
      typeof body.submissionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.submissionId,
      ) ||
      typeof body.token !== "string" ||
      !body.token ||
      body.token.length > 2048
    )
      return reply(400, { error: "Invalid answers." });
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: body.token }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!verification.ok)
      return reply(503, { error: "Bot check unavailable." });
    const result = await verification.json();
    const hosts = origins.map((value) => new URL(value).hostname);
    if (
      !result.success ||
      result.action !== "launcher_feedback" ||
      !hosts.includes(result.hostname)
    )
      return reply(400, { error: "Please repeat the bot check." });
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await client.rpc("feedback_submit", {
      p_id: body.submissionId,
      p_version: body.version,
      p_answers: body.answers,
    });
    if (error)
      return reply(
        error.code === "22023" ? 400 : error.code === "P0001" ? 429 : 503,
        { error: "Could not record feedback. Try again later." },
      );
    return reply(200, { success: true });
  } catch {
    return reply(400, {
      error: "Could not process feedback. Please try again.",
    });
  }
}
if (import.meta.main) Deno.serve(handleRequest);

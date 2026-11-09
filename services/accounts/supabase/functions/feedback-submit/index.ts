// The public survey is retired. Keep a non-writing response for cached forms and old links.
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
  return reply(410, {
    code: "survey_closed",
    error:
      "The launcher feedback survey has closed. Thank you for your interest.",
  });
}
if (import.meta.main) Deno.serve(handleRequest);

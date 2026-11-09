import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// Minecraft tokens are verified in memory and never persisted, logged or returned.
export async function handleRequest(request: Request): Promise<Response> {
  const reply = (status: number, error?: string) =>
    Response.json(error ? { error } : { linked: true }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (request.method !== "POST") return reply(405, "Use POST.");
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ") || bearer.length > 8192)
    return reply(401, "Sign in to Azuria first.");
  if (Number(request.headers.get("content-length") || 0) > 8192)
    return reply(413, "Request too large.");
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 8192)
      return reply(413, "Request too large.");
    const body = JSON.parse(raw);
    if (
      typeof body.minecraftToken !== "string" ||
      body.minecraftToken.length < 20 ||
      body.minecraftToken.length > 7000
    )
      return reply(400, "Invalid Minecraft session.");
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client.auth.getUser(bearer.slice(7));
    if (error || !data.user?.email_confirmed_at)
      return reply(401, "Verify your Azuria account first.");
    // Fixed host, no redirects: never send a Minecraft credential to a caller-selected URL.
    const response = await fetch(
      "https://api.minecraftservices.com/minecraft/profile",
      {
        headers: { Authorization: `Bearer ${body.minecraftToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      return reply(403, "Reconnect your Minecraft account and retry.");
    const text = await response.text();
    if (text.length > 65536) return reply(502, "Invalid Minecraft profile.");
    const profile = JSON.parse(text);
    if (typeof profile.id !== "string" || !/^[a-f0-9]{32}$/i.test(profile.id))
      return reply(502, "Invalid Minecraft profile.");
    const saved = await client.rpc("cosmetics_link_verified", {
      p_user: data.user.id,
      p_uuid: profile.id.toLowerCase(),
    });
    if (saved.error)
      return reply(
        409,
        "This Minecraft account is already linked, or your current link must be removed first.",
      );
    return reply(200);
  } catch {
    return reply(502, "Could not verify the account link. Try again.");
  }
}
if (import.meta.main) Deno.serve(handleRequest);

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("AZURIA_SUPABASE_PUBLISHABLE_KEY")!;
const origins = (
  Deno.env.get("AZURIA_ACCOUNT_ORIGINS") || "https://accounts.azuriasmp.org"
)
  .split(",")
  .map((s) => s.trim());
const authOptions = { persistSession: false, autoRefreshToken: false };
export async function handleRequest(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && origins.includes(origin))
    headers["Access-Control-Allow-Origin"] = origin;
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });
  if (origin && !origins.includes(origin))
    return reply({ error: "This origin is not allowed." }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
  const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return reply({ error: "Sign in first." }, 401);
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return reply({ error: "Request too large." }, 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2048)
      return reply({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    if (
      !["suspend", "restore"].includes(body.action) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 5 ||
      body.reason.length > 300 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.target || "",
      )
    )
      return reply(
        {
          error:
            "Choose an account, action and a reason between 5 and 300 characters.",
        },
        400,
      );
    // The caller's JWT, not the service key, authorizes the operation in PostgreSQL.
    const caller = createClient(url, publicKey, {
      auth: authOptions,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: identity, error: identityError } =
      await caller.auth.getUser(token);
    if (identityError || !identity.user?.email_confirmed_at)
      return reply({ error: "Sign in with a verified account." }, 401);
    const { data: audit, error: denied } = await caller.rpc(
      "admin_prepare_action",
      { p_target: body.target, p_action: body.action, p_reason: body.reason },
    );
    if (denied || !audit)
      return reply(
        {
          error:
            denied?.code === "23505"
              ? "An action for this account is pending review. Check the audit history."
              : denied?.code === "P0001"
                ? "Too many admin actions. Try again later."
                : "This action is not allowed. Verify your password and authenticator again; admin accounts are protected.",
        },
        403,
      );
    const admin = createClient(url, serviceKey, { auth: authOptions });
    // A network error may occur after Auth applies the update. Leave that intent pending.
    let update;
    try {
      update = await admin.auth.admin.updateUserById(body.target, {
        ban_duration: body.action === "suspend" ? "876000h" : "none",
      });
    } catch {
      return reply(
        {
          error:
            "The result could not be confirmed. Check audit history and the user in Supabase before retrying.",
        },
        503,
      );
    }
    if (update.error && (!update.error.status || update.error.status >= 500))
      return reply(
        {
          error:
            "The result could not be confirmed. Check the pending audit record in Supabase.",
        },
        503,
      );
    const { error: auditError } = await admin.rpc("admin_finish_action", {
      p_audit: audit,
      p_success: !update.error,
    });
    if (auditError)
      return reply(
        {
          error:
            "The account action may have applied, but its audit result could not be saved. Check Supabase before retrying.",
        },
        503,
      );
    if (update.error)
      return reply(
        {
          error:
            "The account service rejected this change. The failed attempt was recorded.",
        },
        400,
      );
    return reply({ success: true });
  } catch {
    return reply(
      { error: "The admin service could not complete the request." },
      400,
    );
  }
}
if (import.meta.main) Deno.serve(handleRequest);

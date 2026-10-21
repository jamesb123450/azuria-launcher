import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// Invoked by Supabase Cron, never by the browser. Pending rows survive provider outages.
export async function handleRequest(request: Request): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status });
  const secret = Deno.env.get("MARKETING_SYNC_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`)
    return reply({ error: "Unauthorized" }, 401);
  if (request.method !== "POST") return reply({ error: "Use POST" }, 405);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return reply({ error: "Marketing is not configured" }, 503);
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: pending, error } = await admin.rpc(
      "pending_marketing_contacts",
    );
    if (error) throw error;
    let synced = 0,
      failed = 0;
    for (const row of pending || []) {
      try {
        const headers = {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        };
        const endpoint = "https://api.resend.com/contacts";
        const existing = await fetch(
          `${endpoint}/${encodeURIComponent(row.email)}`,
          {
            headers,
            signal: AbortSignal.timeout(10000),
          },
        );
        // Preserve existing contacts and their unsubscribe choices on retries/re-registration.
        if (existing.status === 404) {
          const created = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({ email: row.email, unsubscribed: false }),
            signal: AbortSignal.timeout(10000),
          });
          if (!created.ok) throw new Error("Contact creation failed");
        } else if (!existing.ok) throw new Error("Contact lookup failed");
        const { error: saved } = await admin
          .from("signup_consents")
          .update({ marketing_synced_at: new Date().toISOString() })
          .eq("user_id", row.user_id);
        if (saved) throw saved;
        synced++;
      } catch {
        failed++;
      }
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    return reply({ synced, failed }, failed ? 503 : 200);
  } catch {
    return reply(
      { error: "Marketing sync failed; pending contacts will be retried" },
      503,
    );
  }
}
if (import.meta.main) Deno.serve(handleRequest);

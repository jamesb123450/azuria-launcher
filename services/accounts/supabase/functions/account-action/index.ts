import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// Only this function has the administrative key. Browser and launcher keys are public.
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("AZURIA_SUPABASE_PUBLISHABLE_KEY")!;
const origins = (
  Deno.env.get("AZURIA_ACCOUNT_ORIGINS") || "https://accounts.azuriasmp.org"
)
  .split(",")
  .map((s) => s.trim());
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const digest = async (text: string) =>
  encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  );
const validCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

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
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin))
    return respond({ error: "This origin is not allowed." }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "Use POST." }, 405);
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return respond({ error: "Request too large." }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4096)
      return respond({ error: "Request too large." }, 413);
    const body = JSON.parse(raw);
    const admin = createClient(url, serviceKey, options);
    if (body.action === "redeem") {
      if (!validCode(body.code) || !validCode(body.verifier))
        return respond({ error: "Invalid connection code." }, 400);
      const { data: id, error } = await admin.rpc("consume_desktop_grant", {
        p_hash: await digest(body.code),
        p_challenge: await digest(body.verifier),
      });
      if (error || !id)
        return respond(
          {
            error:
              "That code expired, was already used or belongs to another launcher. Start sign-in again.",
          },
          400,
        );
      const { data, error: userError } = await admin.auth.admin.getUserById(id);
      if (userError || !data.user?.email_confirmed_at || !data.user.email)
        return respond({ error: "Verify your email before connecting." }, 403);
      // Create an independent native session. No browser refresh token is copied or stored.
      const { data: link, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: data.user.email,
        });
      if (linkError || !link.properties?.hashed_token)
        return respond(
          {
            error: "Could not create a launcher session. Start sign-in again.",
          },
          503,
        );
      const auth = createClient(url, publicKey, options);
      const { data: session, error: sessionError } = await auth.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
      });
      if (
        sessionError ||
        !session.session ||
        !session.user ||
        session.user.id !== id
      )
        return respond(
          { error: "Could not connect the launcher. Start sign-in again." },
          503,
        );
      return respond({
        refresh_token: session.session.refresh_token,
        access_token: session.session.access_token,
        user: {
          id,
          email: session.user.email,
          email_confirmed_at: session.user.email_confirmed_at,
        },
      });
    }
    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer /i, "");
    if (!token) return respond({ error: "Sign in first." }, 401);
    const { data: identity, error: identityError } =
      await admin.auth.getUser(token);
    if (
      identityError ||
      !identity.user?.email_confirmed_at ||
      !identity.user.email
    )
      return respond({ error: "Sign in with a verified account first." }, 401);
    if (body.action === "authorize") {
      if (!validCode(body.challenge))
        return respond(
          { error: "Start sign-in from the launcher again." },
          400,
        );
      const code = encode(crypto.getRandomValues(new Uint8Array(32)));
      const { error } = await admin.rpc("issue_desktop_grant", {
        p_user: identity.user.id,
        p_hash: await digest(code),
        p_challenge: body.challenge,
      });
      if (error)
        return respond(
          {
            error:
              error.code === "P0001"
                ? "Too many connection attempts. Try again in five minutes."
                : "Could not create a connection code.",
          },
          error.code === "P0001" ? 429 : 503,
        );
      return respond({ code, expires_in: 120 });
    }
    if (body.action === "delete") {
      if (
        typeof body.password !== "string" ||
        body.password.length > 128 ||
        !body.password
      )
        return respond({ error: "Confirm your password." }, 400);
      const auth = createClient(url, publicKey, options);
      const { data, error } = await auth.auth.signInWithPassword({
        email: identity.user.email,
        password: body.password,
      });
      if (error || data.user?.id !== identity.user.id)
        return respond(
          {
            error:
              "Your password wasn’t recognised. Try again later if attempts are limited.",
          },
          403,
        );
      const { error: deleted } = await admin.auth.admin.deleteUser(
        identity.user.id,
      );
      if (deleted)
        return respond(
          { error: "Could not delete your account. Try again." },
          503,
        );
      return respond({ deleted: true });
    }
    return respond({ error: "Unknown action." }, 400);
  } catch {
    // Never echo request bodies, passwords, grant codes, tokens or provider errors.
    return respond(
      { error: "The account service could not complete the request." },
      400,
    );
  }
}

if (import.meta.main) Deno.serve(handleRequest);

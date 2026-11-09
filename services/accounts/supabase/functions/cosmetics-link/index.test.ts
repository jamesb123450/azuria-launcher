import { strictEqual as equal, ok } from "node:assert";
Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
const { handleRequest } = await import("./index.ts");
const user = "11111111-1111-4111-8111-111111111111",
  uuid = "a".repeat(32),
  token = "minecraft-secret-".repeat(3);
const request = (body: unknown = { minecraftToken: token }, auth = true) =>
  new Request("https://test-project.supabase.co/functions/v1/cosmetics-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer azuria-session" } : {}),
    },
    body: JSON.stringify(body),
  });
async function scenario(mode: string) {
  const saved = globalThis.fetch;
  const calls: { url: string; body: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: String(init?.body || "") });
    if (url.endsWith("/auth/v1/user"))
      return Response.json(
        mode === "auth"
          ? { message: "invalid" }
          : { id: user, email_confirmed_at: "2026-01-01T00:00:00Z" },
        { status: mode === "auth" ? 401 : 200 },
      );
    if (url === "https://api.minecraftservices.com/minecraft/profile") {
      equal(new Headers(init?.headers).get("Authorization"), "Bearer " + token);
      equal(init?.redirect, "error");
      return Response.json(
        mode === "bad-profile" ? { id: "invalid" } : { id: uuid },
        { status: mode === "minecraft" ? 401 : 200 },
      );
    }
    if (url.endsWith("/rest/v1/rpc/cosmetics_link_verified")) {
      equal(JSON.parse(String(init?.body)).p_user, user);
      equal(JSON.parse(String(init?.body)).p_uuid, uuid);
      return Response.json(mode === "conflict" ? { code: "23505" } : null, {
        status: mode === "conflict" ? 409 : 200,
      });
    }
    throw Error("Unexpected request " + url);
  };
  try {
    return {
      response: await handleRequest(
        request({
          minecraftToken: token,
          p_user: "attacker",
          uuid: "b".repeat(32),
          url: "https://evil.test",
        }),
      ),
      calls,
    };
  } finally {
    globalThis.fetch = saved;
  }
}
Deno.test(
  "missing auth and malformed or oversized input never reach external services",
  async () => {
    equal((await handleRequest(request({}, false))).status, 401);
    equal((await handleRequest(request({ minecraftToken: "x" }))).status, 400);
    equal(
      (await handleRequest(request({ minecraftToken: "x".repeat(9000) })))
        .status,
      413,
    );
    equal(
      (await handleRequest(new Request("https://test.test", { method: "GET" })))
        .status,
      405,
    );
  },
);
Deno.test(
  "verified identities are derived from Azuria and Minecraft, ignoring supplied IDs and URLs",
  async () => {
    const { response, calls } = await scenario("ok");
    equal(response.status, 200);
    equal(calls.length, 3);
    ok(!calls.at(-1)!.body.includes(token));
    ok(!(await response.text()).includes(token));
  },
);
Deno.test(
  "invalid Azuria credentials stop before Minecraft verification",
  async () => {
    const { response, calls } = await scenario("auth");
    equal(response.status, 401);
    equal(calls.length, 1);
  },
);
Deno.test(
  "invalid Minecraft session or UUID never creates a link",
  async () => {
    for (const mode of ["minecraft", "bad-profile"]) {
      const { response, calls } = await scenario(mode);
      ok(response.status >= 400);
      equal(calls.length, 2);
    }
  },
);
Deno.test(
  "duplicate UUID or conflicting link returns a recoverable conflict",
  async () => {
    equal((await scenario("conflict")).response.status, 409);
  },
);

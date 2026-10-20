import { strictEqual as assertEquals, ok as assert } from "node:assert";
Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
Deno.env.set("AZURIA_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
const { handleRequest } = await import("./index.ts");
const origin = "https://accounts.azuriasmp.org";
function request(body: unknown, token?: string, from = origin) {
  return new Request(
    "https://test-project.supabase.co/functions/v1/account-action",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: from,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}
Deno.test(
  "rejects unrelated browser origins before making privileged requests",
  async () => {
    const response = await handleRequest(
      request({ action: "authorize" }, "user-token", "https://evil.test"),
    );
    assertEquals(response.status, 403);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  },
);
Deno.test(
  "authorization requires a signed-in user and redemption requires a valid code format",
  async () => {
    assertEquals(
      (
        await handleRequest(
          request({ action: "authorize", challenge: "x".repeat(43) }),
        )
      ).status,
      401,
    );
    assertEquals(
      (
        await handleRequest(
          request({ action: "redeem", code: "bad", verifier: "bad" }),
        )
      ).status,
      400,
    );
  },
);
Deno.test(
  "authorization uses verified server identity and stores a hash instead of the raw code",
  async () => {
    const original = globalThis.fetch;
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body || "{}"));
      calls.push({ path, body });
      const result =
        path === "/auth/v1/user"
          ? {
              id: "verified-user",
              email: "a@example.com",
              email_confirmed_at: new Date().toISOString(),
            }
          : null;
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const response = await handleRequest(
        request(
          { action: "authorize", user_id: "victim", challenge: "x".repeat(43) },
          "user-token",
        ),
      );
      assertEquals(response.status, 200);
      const result = await response.json();
      const rpc = calls.find((call) =>
        call.path.endsWith("/issue_desktop_grant"),
      )!;
      assertEquals(rpc.body.p_user, "verified-user");
      assertEquals(String(rpc.body.p_hash).length, 43);
      assert(rpc.body.p_hash !== result.code);
      assert(!JSON.stringify(result).includes("server-only-test-key"));
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test("unverified accounts cannot authorize the launcher", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "user", email: "a@example.com" }), {
      headers: { "Content-Type": "application/json" },
    });
  try {
    assertEquals(
      (
        await handleRequest(
          request(
            { action: "authorize", challenge: "x".repeat(43) },
            "user-token",
          ),
        )
      ).status,
      401,
    );
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test(
  "deletion reauthenticates and rejects a password belonging to a different identity",
  async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      const data =
        path === "/auth/v1/user"
          ? {
              id: "user-a",
              email: "a@example.com",
              email_confirmed_at: new Date().toISOString(),
            }
          : {
              access_token: "token",
              refresh_token: "refresh",
              expires_in: 3600,
              token_type: "bearer",
              user: { id: "user-b" },
            };
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const response = await handleRequest(
        request(
          { action: "delete", password: "not-a-real-password" },
          "user-token",
        ),
      );
      assertEquals(response.status, 403);
      assert(!calls.some((path) => path.includes("/admin/users")));
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test("a consumed or incorrect grant cannot create a session", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    paths.push(new URL(String(input)).pathname);
    return new Response("null", {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await handleRequest(
      request({
        action: "redeem",
        code: "c".repeat(43),
        verifier: "v".repeat(43),
      }),
    );
    assertEquals(response.status, 400);
    assertEquals(paths.length, 1);
    assert(paths[0].endsWith("/consume_desktop_grant"));
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test(
  "a valid grant creates a distinct native session for its stored account",
  async () => {
    const original = globalThis.fetch;
    const id = "11111111-1111-4111-8111-111111111111";
    const user = {
      id,
      email: "a@example.com",
      email_confirmed_at: new Date().toISOString(),
    };
    const paths: string[] = [];
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      let data: unknown;
      if (path.endsWith("/consume_desktop_grant")) data = id;
      else if (path.endsWith(`/admin/users/${id}`)) data = user;
      else if (path.endsWith("/admin/generate_link"))
        data = {
          user,
          hashed_token: "server-generated-hash",
          action_link: "unused",
          verification_type: "magiclink",
        };
      else if (path.endsWith("/verify"))
        data = {
          access_token: "native-access",
          refresh_token: "native-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else throw new Error("Unexpected network call");
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const response = await handleRequest(
        request({
          action: "redeem",
          code: "c".repeat(43),
          verifier: "v".repeat(43),
        }),
      );
      assertEquals(response.status, 200);
      const data = await response.json();
      assertEquals(data.user.id, id);
      assertEquals(data.refresh_token, "native-refresh");
      assert(!JSON.stringify(data).includes("server-only-test-key"));
      assertEquals(paths.length, 4);
    } finally {
      globalThis.fetch = original;
    }
  },
);

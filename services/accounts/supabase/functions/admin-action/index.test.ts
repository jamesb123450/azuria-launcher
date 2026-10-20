import { strictEqual as equal, ok } from "node:assert";
Deno.env.set("SUPABASE_URL", "https://test-project.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
Deno.env.set("AZURIA_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
const { handleRequest } = await import("./index.ts");
const target = "22222222-2222-4222-8222-222222222222";
const audit = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function request(
  token = "user-jwt",
  origin = "https://accounts.azuriasmp.org",
) {
  return new Request(
    "https://test-project.supabase.co/functions/v1/admin-action",
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action: "suspend",
        target,
        reason: "Repeated account abuse",
      }),
    },
  );
}
async function mocked(
  mode: string,
  run: (
    calls: {
      path: string;
      body: Record<string, unknown>;
      auth: string | null;
    }[],
  ) => Promise<void>,
) {
  const original = globalThis.fetch;
  const calls: {
    path: string;
    body: Record<string, unknown>;
    auth: string | null;
  }[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const headers = new Headers(init?.headers);
    calls.push({
      path,
      body: JSON.parse(String(init?.body || "{}")),
      auth: headers.get("authorization"),
    });
    let data: unknown = null,
      status = 200;
    if (path === "/auth/v1/user")
      data = {
        id: "11111111-1111-4111-8111-111111111111",
        email: "admin@example.com",
        email_confirmed_at: new Date().toISOString(),
      };
    else if (path.endsWith("/admin_prepare_action")) {
      if (mode === "denied") {
        data = { code: "42501", message: "MFA or role missing" };
        status = 403;
      } else data = audit;
    } else if (path.includes("/auth/v1/admin/users/")) {
      if (mode === "network") throw new TypeError("network interrupted");
      if (mode === "rejected") {
        status = 422;
        data = { code: "validation_failed", msg: "Cannot update account" };
      } else if (mode === "server") {
        status = 503;
        data = { msg: "Temporary failure" };
      } else data = { user: { id: target } };
    } else if (path.endsWith("/admin_finish_action")) {
      if (mode === "audit-failure") {
        status = 500;
        data = { code: "XX000", message: "Database unavailable" };
      }
    } else throw new Error("Unexpected request");
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
Deno.test("rejects unrelated origins and missing authentication", async () => {
  equal(
    (await handleRequest(request("user-jwt", "https://evil.test"))).status,
    403,
  );
  equal((await handleRequest(request(""))).status, 401);
});
Deno.test(
  "denied database authorization never calls the Auth Admin API",
  async () => {
    await mocked("denied", async (calls) => {
      equal((await handleRequest(request())).status, 403);
      ok(!calls.some((call) => call.path.includes("/admin/users/")));
      equal(
        calls.find((call) => call.path.endsWith("/admin_prepare_action"))?.auth,
        "Bearer user-jwt",
      );
    });
  },
);
Deno.test(
  "writes audit intent using caller credentials before privileged API calls",
  async () => {
    await mocked("success", async (calls) => {
      const response = await handleRequest(request());
      equal(response.status, 200);
      equal((await response.json()).success, true);
      equal(calls[1].path, "/rest/v1/rpc/admin_prepare_action");
      equal(calls[2].body.ban_duration, "876000h");
      equal(calls[2].auth, "Bearer server-only-test-key");
      equal(calls[3].body.p_audit, audit);
      equal(calls[3].body.p_success, true);
    });
  },
);
Deno.test("a definitive Auth rejection is recorded as failed", async () => {
  await mocked("rejected", async (calls) => {
    equal((await handleRequest(request())).status, 400);
    equal(
      calls.find((call) => call.path.endsWith("/admin_finish_action"))?.body
        .p_success,
      false,
    );
  });
});
Deno.test(
  "uncertain API outcomes remain pending instead of claiming failure or success",
  async () => {
    for (const mode of ["network", "server"])
      await mocked(mode, async (calls) => {
        equal((await handleRequest(request())).status, 503);
        ok(!calls.some((call) => call.path.endsWith("/admin_finish_action")));
      });
  },
);
Deno.test(
  "audit finalization failure cannot produce a success response",
  async () => {
    await mocked("audit-failure", async () => {
      const response = await handleRequest(request());
      equal(response.status, 503);
      const data = await response.json();
      ok(data.error.includes("may have applied"));
      ok(!JSON.stringify(data).includes("server-only-test-key"));
    });
  },
);

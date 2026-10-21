import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const source = await readFile(
  new URL(
    "../../../../services/accounts/supabase/functions/marketing-sync/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const moduleSource = stripTypeScriptTypes(
  source.replace(
    /^import .*\n/,
    "const createClient = (...args) => globalThis.marketingClient(...args);\n",
  ),
);
const { handleRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`
);

test("marketing sync authenticates, preserves unsubscribes and retries failed contacts", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  const originalDeno = globalThis.Deno;
  const env = {
    MARKETING_SYNC_SECRET: "test-secret",
    RESEND_API_KEY: "test-key",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
  };
  globalThis.Deno = { env: { get: (name) => env[name] } };
  const rows = [{ user_id: "one", email: "one@example.com" }];
  const saved = [],
    calls = [];
  globalThis.marketingClient = () => ({
    rpc: async () => ({ data: rows }),
    from: () => ({
      update: (value) => ({
        eq: async (_, id) => {
          saved.push({ id, ...value });
          return {};
        },
      }),
    }),
  });
  globalThis.setTimeout = (callback) => originalTimer(callback, 0);
  const request = (secret = "test-secret") =>
    new Request("https://example.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response("{}", { status: 200 });
    };
    assert.equal((await handleRequest(request("wrong"))).status, 401);
    assert.equal(calls.length, 0);
    await handleRequest(request());
    assert.equal(calls.length, 1, "existing contact is never resubscribed");
    assert.equal(saved.length, 1);
    calls.length = saved.length = 0;
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response("{}", {
        status: options.method === "POST" ? 200 : 404,
      });
    };
    assert.equal((await handleRequest(request())).status, 200);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
      email: "one@example.com",
      unsubscribed: false,
    });
    assert.equal(saved.length, 1);
    saved.length = 0;
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    assert.equal((await handleRequest(request())).status, 503);
    assert.equal(saved.length, 0, "failure remains pending");
    rows.length = 0;
    calls.length = 0;
    globalThis.fetch = async () => {
      throw new Error("must not call Resend without pending consent");
    };
    assert.equal((await handleRequest(request())).status, 200);
    delete env.RESEND_API_KEY;
    assert.equal((await handleRequest(request())).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimer;
    globalThis.Deno = originalDeno;
    delete globalThis.marketingClient;
  }
});

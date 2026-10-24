import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
const source = await readFile(
  new URL(
    "../../../../services/accounts/supabase/functions/feedback-submit/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const moduleSource = stripTypeScriptTypes(
  source.replace(
    /^import .*\n/,
    "const createClient = (...args) => globalThis.feedbackClient(...args);\n",
  ),
);
const { handleRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`
);
test("anonymous feedback verifies bot proof before writing and never forwards identifying headers", async () => {
  const originalFetch = globalThis.fetch,
    originalDeno = globalThis.Deno;
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    AZURIA_TURNSTILE_SECRET_KEY: "test-secret",
  };
  globalThis.Deno = { env: { get: (name) => env[name] } };
  const writes = [],
    checks = [];
  globalThis.feedbackClient = () => ({
    rpc: async (name, args) => {
      writes.push({ name, args });
      return {};
    },
  });
  let proof = {
    success: true,
    action: "launcher_feedback",
    hostname: "azuriasmp.org",
  };
  globalThis.fetch = async (_, options) => {
    checks.push(JSON.parse(options.body));
    return Response.json(proof);
  };
  const payload = {
    version: 1,
    submissionId: "55555555-5555-4555-8555-555555555555",
    answers: { launchers: ["azuria"] },
    token: "test-proof",
  };
  const request = (body = payload, origin = "https://azuriasmp.org") =>
    new Request("https://test.supabase.co/functions/v1/feedback-submit", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Authorization: "Bearer do-not-use",
        "X-Forwarded-For": "192.0.2.1",
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await handleRequest(request(payload, "https://evil.example"))).status,
      403,
    );
    assert.equal(checks.length, 0);
    for (const rejected of [
      { ...payload, token: "" },
      { ...payload, version: 2 },
      { ...payload, email: "no@example.com" },
      { ...payload, submissionId: "not-a-uuid" },
    ])
      assert.equal((await handleRequest(request(rejected))).status, 400);
    assert.equal(writes.length, 0);
    for (const invalid of [
      { ...proof, success: false },
      { ...proof, action: "other" },
      { ...proof, hostname: "evil.example" },
    ]) {
      proof = invalid;
      assert.equal((await handleRequest(request())).status, 400);
    }
    assert.equal(writes.length, 0);
    proof = {
      success: true,
      action: "launcher_feedback",
      hostname: "azuriasmp.org",
    };
    assert.equal((await handleRequest(request())).status, 200);
    assert.deepEqual(writes, [
      {
        name: "feedback_submit",
        args: {
          p_id: payload.submissionId,
          p_version: 1,
          p_answers: payload.answers,
        },
      },
    ]);
    assert.deepEqual(checks.at(-1), {
      secret: "test-secret",
      response: "test-proof",
    });
    const oversized = new Request("https://test.supabase.co", {
      method: "POST",
      body: "x".repeat(16385),
    });
    assert.equal((await handleRequest(oversized)).status, 413);
    delete env.AZURIA_TURNSTILE_SECRET_KEY;
    assert.equal((await handleRequest(request())).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
    delete globalThis.feedbackClient;
  }
});

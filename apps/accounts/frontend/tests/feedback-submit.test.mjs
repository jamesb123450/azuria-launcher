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
const { handleRequest } = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
);

test("retired survey rejects cached submissions without consuming answers or contacting external services", async () => {
  const originalDeno = globalThis.Deno,
    originalFetch = globalThis.fetch;
  globalThis.Deno = { env: { get: () => undefined } };
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("Survey must not contact a service");
  };
  try {
    for (const origin of [
      "https://azuriasmp.org",
      "https://www.azuriasmp.org",
      "",
    ]) {
      const headers = { "Content-Type": "application/json" };
      if (origin) headers.Origin = origin;
      const request = new Request(
        "https://test.supabase.co/functions/v1/feedback-submit",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            version: 1,
            answers: { launchers: ["azuria"] },
            extraFeedback: "Existing form",
            token: "old-proof",
          }),
        },
      );
      const result = await handleRequest(request);
      assert.equal(result.status, 410);
      assert.equal((await result.json()).code, "survey_closed");
      assert.equal(request.bodyUsed, false);
      assert.equal(result.headers.get("Cache-Control"), "no-store");
      assert.equal(
        result.headers.get("Access-Control-Allow-Origin"),
        origin || null,
      );
    }
    assert.equal(requests, 0);
    assert.doesNotMatch(source, /createClient|\.rpc\(|fetch\(/);
  } finally {
    globalThis.Deno = originalDeno;
    globalThis.fetch = originalFetch;
  }
});

test("closed survey keeps restrictive CORS and supports preflight", async () => {
  const originalDeno = globalThis.Deno;
  globalThis.Deno = { env: { get: () => undefined } };
  try {
    const url = "https://test.supabase.co/functions/v1/feedback-submit";
    assert.equal(
      (
        await handleRequest(
          new Request(url, {
            method: "POST",
            headers: { Origin: "https://evil.example" },
          }),
        )
      ).status,
      403,
    );
    const preflight = await handleRequest(
      new Request(url, {
        method: "OPTIONS",
        headers: { Origin: "https://azuriasmp.org" },
      }),
    );
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("Access-Control-Allow-Origin"),
      "https://azuriasmp.org",
    );
    assert.equal((await handleRequest(new Request(url))).status, 405);
  } finally {
    globalThis.Deno = originalDeno;
  }
});

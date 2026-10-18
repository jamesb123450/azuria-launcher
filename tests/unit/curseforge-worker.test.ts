import { expect, it } from "vitest";
// @ts-expect-error Worker JavaScript is exercised directly.
import { handle, target } from "../../services/curseforge/worker.mjs";
const req = (path: string, options = {}) =>
  new Request(`https://azuria.example${path}`, options);
it("restricts proxy requests to bounded read-only provider routes", () => {
  expect(target(req("/v1/mods/search?gameId=432&pageSize=24"))?.origin).toBe(
    "https://api.curseforge.com",
  );
  expect(target(req("/v1/mods/123/files/456/changelog"))).not.toBeNull();
  for (const path of [
    "/v1/mods/search?gameId=1",
    "/v1/mods/search?gameId=432&pageSize=1000",
    "/v1/mods/123?url=https://example.com",
    "/v1/fingerprints",
    "/v1/mods/123?index=0&index=1",
  ])
    expect(target(req(path))).toBeNull();
  expect(target(req("/v1/mods/123", { method: "POST" }))).toBeNull();
});
it("keeps credentials upstream, strips headers and fails closed", async () => {
  const secret = "private-key-sentinel";
  const env = {
    CURSEFORGE_API_KEY: secret,
    CONTENT_LIMIT: { limit: async () => ({ success: true }) },
  };
  let sent: any;
  const response = await handle(
    req("/v1/mods/123"),
    env,
    async (url: URL, init: any) => {
      sent = { url: String(url), ...init };
      return Response.json(
        { data: { id: 123 } },
        { headers: { "x-secret": secret } },
      );
    },
  );
  expect(sent.headers["x-api-key"]).toBe(secret);
  expect(sent.redirect).toBe("manual");
  expect(await response.text()).not.toContain(secret);
  expect(response.headers.get("x-secret")).toBeNull();
  expect((await handle(req("/v1/mods/123"), {})).status).toBe(503);
  expect(
    (
      await handle(req("/v1/mods/123"), {
        ...env,
        CONTENT_LIMIT: { limit: async () => ({ success: false }) },
      })
    ).status,
  ).toBe(429);
  const failure = await handle(req("/v1/mods/123"), env, async () => {
    throw Error(secret);
  });
  expect(await failure.text()).not.toContain(secret);
});

it("bounds bulk metadata requests and only forwards validated IDs", async () => {
  const env = {
    CURSEFORGE_API_KEY: "private",
    CONTENT_LIMIT: { limit: async () => ({ success: true }) },
  };
  let sent: any;
  const upstream = async (_: URL, init: any) => {
    sent = JSON.parse(init.body);
    return Response.json({ data: [] });
  };
  const post = (body: unknown) =>
    req("/v1/mods/files", { method: "POST", body: JSON.stringify(body) });
  expect(
    (await handle(post({ fileIds: [123, 456] }), env, upstream)).status,
  ).toBe(200);
  expect(sent).toEqual({ fileIds: [123, 456] });
  for (const body of [
    { fileIds: ["123"] },
    { fileIds: [-1] },
    { fileIds: [], url: "https://example.com" },
    { fileIds: Array(1001).fill(1) },
  ])
    expect((await handle(post(body), env, upstream)).status).toBe(400);
});

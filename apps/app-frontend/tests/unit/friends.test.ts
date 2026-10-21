import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({ request: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../../src/friends-api", () => ({ friendsApi: api }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("../../src/api", () => ({ desktop: true }));
import { useFriends } from "../../src/stores/friends";
import { useAzuriaAccount } from "../../src/stores/azuria-account";
const signed = (id = "alice") => ({
  supported: true,
  configured: true,
  account: { id, email: `${id}@example.com`, username: id, displayName: id },
});
const row = {
  kind: "friend",
  account_id: "bob",
  username: "bob",
  display_name: "Bob",
  since: "2026-10-20T00:00:00Z",
};
const view = (overrides = {}) => ({
  accountId: "alice",
  entries: [row],
  matches: [],
  mutationApplied: false,
  warning: null,
  ...overrides,
});
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  api.invoke.mockResolvedValue(signed());
  api.request.mockResolvedValue(view());
});
it("loads once at startup and sorts only accepted friends", async () => {
  const store = useFriends();
  await store.init();
  await Promise.resolve();
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(store.friends.map((entry) => entry.username)).toEqual(["bob"]);
  expect(store.incoming).toEqual([]);
});
it("signed-out sessions make no friends request", async () => {
  api.invoke.mockResolvedValue({
    supported: true,
    configured: true,
    account: null,
  });
  const store = useFriends();
  await store.init();
  expect(api.request).not.toHaveBeenCalled();
});
it("clears private data and ignores a late reply after switching accounts", async () => {
  const account = useAzuriaAccount(),
    store = useFriends();
  await store.init();
  await Promise.resolve();
  let resolve!: (value: ReturnType<typeof view>) => void;
  api.request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = store.refresh();
  account.view = { ...signed(), account: null };
  expect(store.entries).toEqual([]);
  expect(store.open).toBe(false);
  resolve(view());
  await pending;
  expect(store.entries).toEqual([]);
  expect(store.loaded).toBe(false);
});
it("rejects data belonging to a different native account", async () => {
  const store = useFriends();
  await store.init();
  await Promise.resolve();
  api.request.mockResolvedValueOnce(view({ accountId: "other", entries: [] }));
  await store.refresh();
  expect(store.friends[0].username).toBe("bob");
});
it("keeps the last snapshot on network failure and exposes a retry error", async () => {
  const store = useFriends();
  await store.init();
  await Promise.resolve();
  api.request.mockRejectedValueOnce("Refresh Friends before retrying.");
  await store.refresh();
  expect(store.friends).toHaveLength(1);
  expect(store.error).toContain("Refresh Friends");
});
it("distinguishes an applied change from a failed follow-up snapshot without retrying mutation", async () => {
  const store = useFriends();
  await store.init();
  await Promise.resolve();
  api.request.mockResolvedValueOnce(
    view({
      entries: null,
      mutationApplied: true,
      warning: "Saved, but refresh failed.",
    }),
  );
  expect(await store.act("block", "bob")).toBe(true);
  expect(store.notice).toContain("Saved, but refresh failed");
  expect(
    api.request.mock.calls.filter(([action]) => action === "block"),
  ).toHaveLength(1);
});
it("clears old search results after sending a request and uses the returned snapshot", async () => {
  const store = useFriends();
  await store.init();
  await Promise.resolve();
  api.request.mockResolvedValueOnce(
    view({
      entries: null,
      matches: [
        {
          id: "charlie",
          username: "charlie",
          display_name: "Charlie",
          relationship: "none",
        },
      ],
    }),
  );
  await store.find("charlie");
  expect(store.matches).toHaveLength(1);
  api.request.mockResolvedValueOnce(
    view({
      mutationApplied: true,
      entries: [
        row,
        {
          ...row,
          kind: "outgoing",
          account_id: "charlie",
          username: "charlie",
        },
      ],
    }),
  );
  await store.act("send", "charlie");
  expect(store.outgoing).toHaveLength(1);
  expect(store.matches).toEqual([]);
});

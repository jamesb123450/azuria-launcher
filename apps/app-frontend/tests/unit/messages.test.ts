import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("../../src/api", () => ({ desktop: true }));
import { useMessages } from "../../src/stores/messages";
import { useAzuriaAccount } from "../../src/stores/azuria-account";
const friend = {
  kind: "friend" as const,
  account_id: "bob",
  username: "bob",
  display_name: "Bob",
  since: "2026-10-24",
};
const row = {
  id: 1,
  sender_id: "bob",
  recipient_id: "alice",
  body: "hello",
  created_at: "2026-10-24T12:00:00Z",
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.stubGlobal("document", { visibilityState: "visible" });
  useAzuriaAccount().view = {
    supported: true,
    configured: true,
    account: {
      id: "alice",
      email: "a@example.com",
      username: "alice",
      displayName: "Alice",
    },
  };
  api.invoke.mockImplementation(async (_name, args) => ({
    accountId: "alice",
    data:
      args.action === "history" ? [row] : args.action === "unread" ? [] : null,
  }));
});
it("clears conversation and rejects late results after sign-out", async () => {
  const store = useMessages();
  let done!: (value: unknown) => void;
  api.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  store.select(friend);
  useAzuriaAccount().view.account = null;
  done({ accountId: "alice", data: [row] });
  await flush();
  expect(store.rows).toEqual([]);
  expect(store.peer).toBeNull();
  expect(store.busy).toBe(false);
});
it("rejects replies for another native account", async () => {
  const store = useMessages();
  api.invoke.mockResolvedValue({ accountId: "other", data: [row] });
  store.select(friend);
  await flush();
  expect(store.rows).toEqual([]);
  expect(store.error).toBeTruthy();
});
it("unchanged retry keeps its ID and draft; a successful retry clears the draft", async () => {
  const store = useMessages();
  store.select(friend);
  await flush();
  store.draft = "Hi Bob";
  api.invoke.mockRejectedValueOnce("Network unavailable");
  await store.send();
  const first = api.invoke.mock.calls.at(-1)?.[1];
  expect(store.draft).toBe("Hi Bob");
  api.invoke.mockResolvedValueOnce({
    accountId: "alice",
    data: [{ ...row, id: 2, sender_id: "alice", body: "Hi Bob" }],
  });
  await store.send();
  expect(api.invoke.mock.calls.at(-1)?.[1].clientId).toBe(first.clientId);
  expect(store.draft).toBe("");
  expect(store.rows).toHaveLength(2);
});
it("does not acknowledge messages while hidden", async () => {
  vi.stubGlobal("document", { visibilityState: "hidden" });
  const store = useMessages();
  store.select(friend);
  await flush();
  expect(api.invoke.mock.calls.some((call) => call[1].action === "read")).toBe(
    false,
  );
});

it("waits for a friends refresh before making a messaging request", async () => {
  const { useFriends } = await import("../../src/stores/friends");
  const friends = useFriends();
  friends.busy = true;
  friends.open = true;
  const store = useMessages();
  store.select(friend);
  await flush();
  expect(api.invoke).not.toHaveBeenCalled();
  friends.busy = false;
  await flush();
  expect(store.rows).toEqual([row]);
});

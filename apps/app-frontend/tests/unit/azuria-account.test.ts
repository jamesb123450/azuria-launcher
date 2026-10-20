import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const ipc = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke }));
vi.mock("../../src/api", () => ({ desktop: true }));
import { useAzuriaAccount } from "../../src/stores/azuria-account";
const blank = { supported: true, configured: true, account: null };
const signed = {
  ...blank,
  account: {
    id: "user-id",
    email: "player@example.com",
    username: "player",
    displayName: "Player",
  },
};
beforeEach(() => {
  setActivePinia(createPinia());
  ipc.invoke.mockReset();
  ipc.invoke.mockResolvedValue(blank);
});
it("coalesces startup requests without background polling", async () => {
  const store = useAzuriaAccount();
  await Promise.all([store.init(), store.init(), store.init()]);
  await store.init();
  expect(ipc.invoke.mock.calls.map(([command]) => command)).toEqual([
    "azuria_configuration",
    "azuria_status",
  ]);
});
it("leaves an unavailable build unconfigured without a network request", async () => {
  ipc.invoke.mockResolvedValue({ ...blank, configured: false });
  const store = useAzuriaAccount();
  await store.init();
  expect(store.view.configured).toBe(false);
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
});
it("only completes the browser handoff after a successful native response", async () => {
  const store = useAzuriaAccount();
  await store.init();
  ipc.invoke.mockResolvedValueOnce(null);
  await store.begin();
  expect(store.pending).toBe(true);
  ipc.invoke.mockRejectedValueOnce("That code has expired.");
  await store.complete("bad-code");
  expect(store.pending).toBe(true);
  expect(store.error).toBe("That code has expired.");
  ipc.invoke.mockResolvedValueOnce(signed);
  await store.complete("good-code");
  expect(store.pending).toBe(false);
  expect(store.view.account?.username).toBe("player");
});
it("keeps a known account on an offline retry and clears it after native sign-out", async () => {
  const store = useAzuriaAccount();
  await store.init();
  ipc.invoke.mockResolvedValueOnce(signed);
  await store.refresh();
  ipc.invoke.mockRejectedValueOnce("You are offline.");
  await store.refresh();
  expect(store.view.account?.username).toBe("player");
  ipc.invoke.mockResolvedValueOnce(blank);
  await store.signOut();
  expect(store.view.account).toBeNull();
  expect(store.error).toBe("");
});

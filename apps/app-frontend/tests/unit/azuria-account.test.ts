import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: ipc.listen }));
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
  ipc.listen.mockReset();
  ipc.listen.mockResolvedValue(() => {});
  ipc.invoke.mockResolvedValue(blank);
});
it("coalesces startup requests without background polling", async () => {
  const store = useAzuriaAccount();
  await Promise.all([store.init(), store.init(), store.init()]);
  await store.init();
  expect(ipc.invoke.mock.calls.map(([command]) => command)).toEqual([
    "azuria_configuration",
    "azuria_status",
    "azuria_connection",
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

it("updates the account from a native callback without exposing connection codes", async () => {
  const store = useAzuriaAccount();
  await store.init();
  await store.begin();
  const listener = ipc.listen.mock.calls[0][1];
  listener({ payload: { connecting: true, view: null, error: null } });
  expect(store.busy).toBe(true);
  expect(store.pending).toBe(true);
  listener({ payload: { connecting: false, view: signed, error: null } });
  expect(store.pending).toBe(false);
  expect(store.connected).toBe(true);
  expect(store.busy).toBe(false);
  expect(store.view.account?.username).toBe("player");
});
it("a stale status request cannot overwrite a completed browser connection", async () => {
  const store = useAzuriaAccount();
  await store.init();
  let finish!: (value: typeof blank) => void;
  ipc.invoke.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const request = store.refresh();
  ipc.listen.mock.calls[0][1]({
    payload: { connecting: false, view: signed, error: null },
  });
  finish(blank);
  await request;
  expect(store.view.account?.username).toBe("player");
  expect(store.connected).toBe(true);
});
it("native callback errors leave the manual fallback available and cancel invalidates the native request", async () => {
  const store = useAzuriaAccount();
  await store.init();
  await store.begin();
  ipc.listen.mock.calls[0][1]({
    payload: { connecting: false, view: null, error: "This request expired." },
  });
  expect(store.pending).toBe(true);
  expect(store.error).toBe("This request expired.");
  await store.cancel();
  expect(ipc.invoke).toHaveBeenLastCalledWith("azuria_cancel", undefined);
  expect(store.pending).toBe(false);
});

it("retries a saved Azuria session after reconnect without starting an interactive handoff", async () => {
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  let statuses = 0;
  ipc.invoke.mockImplementation(async (command: string) => {
    if (command === "azuria_status") {
      if (++statuses === 1)
        throw "Could not reach Azuria. Your saved session has been kept.";
      return signed;
    }
    if (command === "azuria_connection")
      return { connecting: false, view: null, error: null };
    return blank;
  });
  try {
    const store = useAzuriaAccount();
    await store.init();
    target.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(store.view.account?.id).toBe("user-id"));
    expect(statuses).toBe(2);
    expect(
      ipc.invoke.mock.calls.some(([command]) => command === "azuria_begin"),
    ).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("clears cached identity when the native service confirms session revocation", async () => {
  const store = useAzuriaAccount();
  await store.init();
  ipc.invoke.mockResolvedValueOnce(signed);
  await store.refresh();
  ipc.invoke.mockRejectedValueOnce(
    "Your Azuria session has expired or was revoked. Sign in again.",
  );
  await store.refresh();
  expect(store.view.account).toBeNull();
  expect(store.error).toContain("revoked");
});

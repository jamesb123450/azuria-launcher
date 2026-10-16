import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({
  status: vi.fn(),
  restore: vi.fn(),
  signIn: vi.fn(),
  cancel: vi.fn(),
  signOut: vi.fn(),
  progress: vi.fn(),
}));
vi.mock("../../src/auth", async (original) => ({
  ...(await original<typeof import("../../src/auth")>()),
  accountApi: api,
}));
import { useAccount } from "../../src/stores/account";
const blank = {
  supported: true,
  account: null,
  verified: false,
  hasSavedSession: false,
};
const signed = {
  ...blank,
  account: { username: "Player", minecraftId: "a".repeat(32) },
  verified: true,
  hasSavedSession: true,
};
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  api.status.mockResolvedValue(blank);
  api.restore.mockResolvedValue(blank);
  api.progress.mockResolvedValue(vi.fn());
  api.cancel.mockResolvedValue(blank);
});
it("keeps browser preview unsupported without invoking sign-in", async () => {
  api.status.mockResolvedValue({ ...blank, supported: false });
  const store = useAccount();
  await store.init();
  await store.signIn();
  expect(api.restore).not.toHaveBeenCalled();
  expect(api.signIn).not.toHaveBeenCalled();
});
it("shows a saved account as unverified when restore fails", async () => {
  const cached = { ...signed, verified: false };
  api.status.mockResolvedValue(cached);
  api.restore.mockRejectedValue({
    stage: "microsoft",
    code: "reauthenticate",
    message: "Sign in again.",
  });
  const store = useAccount();
  await store.init();
  expect(store.view.verified).toBe(false);
  expect(store.label).toBe("Player");
  expect(store.error).toBe("Sign in again.");
  expect(store.busy).toBe(false);
});
it("ignores delayed success after cancellation and releases progress listeners", async () => {
  const stop = vi.fn();
  api.progress.mockResolvedValue(stop);
  let resolve!: (value: typeof signed) => void;
  api.signIn.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const store = useAccount();
  await store.init();
  const login = store.signIn();
  await vi.waitFor(() => expect(api.signIn).toHaveBeenCalled());
  await store.cancel();
  resolve(signed);
  await login;
  expect(store.view.account).toBeNull();
  expect(store.busy).toBe(false);
  expect(stop).toHaveBeenCalled();
});
it("does not clear an account when secure sign-out fails", async () => {
  api.restore.mockResolvedValue(signed);
  api.status.mockResolvedValue(signed);
  api.signOut.mockRejectedValue({
    stage: "storage",
    message: "Credential Manager unavailable.",
  });
  const store = useAccount();
  await store.init();
  await store.signOut();
  expect(store.label).toBe("Player");
  expect(store.error).toContain("Credential Manager");
});
it("never displays raw unexpected IPC errors", async () => {
  api.signIn.mockRejectedValue("private-token-in-error");
  const store = useAccount();
  await store.init();
  await store.signIn();
  expect(store.error).not.toContain("private-token");
});

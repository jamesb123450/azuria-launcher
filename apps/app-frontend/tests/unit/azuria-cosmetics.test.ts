import { beforeEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => api);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../../src/api", () => ({ desktop: true }));
import { useAzuriaAccount } from "../../src/stores/azuria-account";
import {
  useAzuriaCosmetics,
  capeTexture,
  type CosmeticSnapshot,
} from "../../src/stores/azuria-cosmetics";
const signIn = (id: string) => {
  useAzuriaAccount().view = {
    configured: true,
    supported: true,
    account: { id, email: id + "@example.com", username: id, displayName: id },
  };
};
const snapshot = (accountId = "alice"): CosmeticSnapshot => ({
  accountId,
  minecraftUuid: null,
  equipped: null,
  capes: [
    {
      id: "azuria-starter",
      name: "Azuria Starter",
      description: "Free",
      texture: "azuria-starter.png",
      owned: false,
      claimable: true,
    },
  ],
});
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  api.invoke.mockResolvedValue(snapshot());
});
it("signed-out users cannot send cosmetic requests", async () => {
  const store = useAzuriaCosmetics();
  expect(await store.request()).toBe(false);
  expect(api.invoke).not.toHaveBeenCalled();
});
it("claims use native account-scoped commands without exposing any token", async () => {
  signIn("alice");
  const store = useAzuriaCosmetics();
  await store.request("claim", "azuria-starter");
  expect(api.invoke).toHaveBeenCalledWith("azuria_cosmetics", {
    action: "claim",
    cape: "azuria-starter",
    expectedAccount: "alice",
    expectedMinecraft: null,
  });
  expect(store.snapshot?.capes).toHaveLength(1);
  expect(store.notice).toContain("added");
});
it("an account switch clears private state and ignores an old in-flight reply", async () => {
  signIn("alice");
  const store = useAzuriaCosmetics();
  await store.request();
  let finish!: (v: CosmeticSnapshot) => void;
  api.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = store.request("claim", "azuria-starter");
  signIn("bob");
  expect(store.snapshot).toBeNull();
  expect(store.busy).toBe(false);
  finish(snapshot());
  expect(await pending).toBe(false);
  expect(store.snapshot).toBeNull();
  expect(store.notice).toBe("");
});
it("wrong-account responses and duplicate clicks cannot overwrite the current wardrobe", async () => {
  signIn("alice");
  const store = useAzuriaCosmetics();
  api.invoke.mockResolvedValue(snapshot("bob"));
  expect(await store.request()).toBe(false);
  expect(store.snapshot).toBeNull();
  let finish!: (v: CosmeticSnapshot) => void;
  api.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = store.request("equip", "azuria-starter");
  expect(await store.request("equip", "azuria-starter")).toBe(false);
  finish(snapshot());
  await pending;
  expect(api.invoke).toHaveBeenCalledTimes(2);
});
it("failed mutations preserve the previous snapshot and can be retried", async () => {
  signIn("alice");
  const store = useAzuriaCosmetics();
  await store.request();
  api.invoke.mockRejectedValueOnce("Unavailable");
  expect(await store.request("equip", "azuria-starter")).toBe(false);
  expect(store.error).toBe("Unavailable");
  expect(store.snapshot?.accountId).toBe("alice");
  expect(store.busy).toBe(false);
  expect(await store.request()).toBe(true);
  expect(store.error).toBe("");
});
it("only bundled textures can be displayed", () => {
  expect(capeTexture("azuria-starter.png")).toBe(
    "/cosmetics/azuria-starter.png",
  );
  for (const value of [
    "https://evil.test/a.png",
    "x');background:red",
    "../../secret",
    "unknown.png",
  ])
    expect(capeTexture(value)).toBeNull();
});

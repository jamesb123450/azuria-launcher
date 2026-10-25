import test from "node:test";
import assert from "node:assert/strict";
import { accountStorage } from "../src/account-storage.js";
function memory() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}
test("account sessions survive a new tab while old tab-only sessions migrate", () => {
  const persistent = memory(),
    oldTab = memory();
  oldTab.setItem("azuria-account", "old-session");
  const first = accountStorage(persistent, oldTab);
  assert.equal(first.getItem("azuria-account"), "old-session");
  assert.equal(oldTab.getItem("azuria-account"), null);
  assert.equal(
    accountStorage(persistent, memory()).getItem("azuria-account"),
    "old-session",
  );
});
test("rotation replaces stale tab credentials and sign-out cannot resurrect them", () => {
  const persistent = memory(),
    tab = memory(),
    storage = accountStorage(persistent, tab);
  tab.setItem("azuria-account", "old");
  storage.setItem("azuria-account", "rotated");
  assert.equal(tab.getItem("azuria-account"), null);
  assert.equal(storage.getItem("azuria-account"), "rotated");
  storage.removeItem("azuria-account");
  assert.equal(storage.getItem("azuria-account"), null);
});
test("an old tab cannot resurrect a signed-out session after migration", () => {
  const persistent = memory(),
    old = memory();
  old.setItem("azuria-account", "stale");
  const storage = accountStorage(persistent, old);
  storage.removeItem("azuria-account");
  const anotherOldTab = memory();
  anotherOldTab.setItem("azuria-account", "stale");
  assert.equal(
    accountStorage(persistent, anotherOldTab).getItem("azuria-account"),
    null,
  );
});

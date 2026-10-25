// Essential account storage. Supabase owns token refresh/expiry; this adapter
// keeps the session on this browser and migrates the previous tab-only storage.
export function accountStorage(persistent, tab) {
  const marker = "azuria-account:persistent-storage-v1";
  if (persistent.getItem(marker) !== "1") {
    for (const key of ["azuria-account", "azuria-account-code-verifier"]) {
      if (persistent.getItem(key) === null && tab.getItem(key) !== null)
        persistent.setItem(key, tab.getItem(key));
      tab.removeItem(key);
    }
    persistent.setItem(marker, "1");
  }
  return {
    getItem(key) {
      return persistent.getItem(key);
    },
    setItem(key, value) {
      persistent.setItem(key, value);
      tab.removeItem(key);
    },
    removeItem(key) {
      persistent.removeItem(key);
      tab.removeItem(key);
    },
  };
}

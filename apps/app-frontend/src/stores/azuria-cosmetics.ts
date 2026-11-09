import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
import { useAzuriaAccount } from "./azuria-account";
export interface AzuriaCape {
  id: string;
  name: string;
  description: string;
  texture: string;
  claimable: boolean;
  owned: boolean;
}
export interface CosmeticSnapshot {
  accountId: string;
  minecraftUuid: string | null;
  equipped: string | null;
  capes: AzuriaCape[];
}
export type CosmeticAction =
  "snapshot" | "claim" | "equip" | "unequip" | "link" | "unlink";
export const useAzuriaCosmetics = defineStore("azuria-cosmetics", () => {
  const account = useAzuriaAccount();
  const owner = computed(() => account.view.account?.id ?? null);
  const snapshot = ref<CosmeticSnapshot | null>(null),
    busy = ref(false),
    error = ref(""),
    notice = ref("");
  let generation = 0;
  watch(
    owner,
    () => {
      generation++;
      snapshot.value = null;
      busy.value = false;
      error.value = "";
      notice.value = "";
    },
    { flush: "sync" },
  );
  async function request(
    action: CosmeticAction = "snapshot",
    cape?: string,
    expectedMinecraft?: string,
  ) {
    const id = owner.value,
      version = generation;
    if (!desktop || !id || busy.value) return false;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      const result = await invoke<CosmeticSnapshot>("azuria_cosmetics", {
        action,
        cape: cape ?? null,
        expectedAccount: id,
        expectedMinecraft: expectedMinecraft ?? null,
      });
      if (
        generation !== version ||
        owner.value !== id ||
        result.accountId !== id
      )
        return false;
      snapshot.value = result;
      if (action !== "snapshot")
        notice.value =
          action === "claim"
            ? "Cape added to your wardrobe."
            : action === "equip"
              ? "Cape selected. In-game display requires the upcoming Azuria cosmetics mod."
              : action === "unequip"
                ? "Azuria cape unequipped."
                : action === "link"
                  ? "Minecraft account verified and linked."
                  : "Minecraft account unlinked.";
      return true;
    } catch (cause) {
      if (generation === version)
        error.value =
          typeof cause === "string"
            ? cause
            : "Could not update cosmetics. Refresh and retry.";
      return false;
    } finally {
      if (generation === version) busy.value = false;
    }
  }
  return { owner, snapshot, busy, error, notice, request };
});
// Only shipped atlas assets are displayed; catalogue text cannot inject an image URL.
export function capeTexture(texture: string): string | null {
  return texture === "azuria-starter.png"
    ? "/cosmetics/azuria-starter.png"
    : null;
}

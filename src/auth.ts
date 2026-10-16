import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "./api";
export const authStages = [
  "browser",
  "microsoft",
  "xbox",
  "minecraft",
  "profile",
  "storage",
  "cancelled",
] as const;
export type AuthStage = (typeof authStages)[number];
export interface AccountView {
  supported: boolean;
  account: { username: string; minecraftId: string } | null;
  verified: boolean;
  hasSavedSession: boolean;
}
export const emptyAccount = (): AccountView => ({
  supported: false,
  account: null,
  verified: false,
  hasSavedSession: false,
});
export const accountApi = {
  status: (): Promise<AccountView> =>
    desktop ? invoke("account_status") : Promise.resolve(emptyAccount()),
  restore: (): Promise<AccountView> => invoke("account_restore"),
  signIn: (): Promise<AccountView> => invoke("account_sign_in"),
  cancel: (): Promise<AccountView> => invoke("account_cancel"),
  signOut: (): Promise<AccountView> => invoke("account_sign_out"),
  progress: (callback: (stage: AuthStage) => void) =>
    listen<AuthStage>("auth-progress", ({ payload }) => {
      if (authStages.includes(payload)) callback(payload);
    }),
};
export function accountError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "stage" in error &&
    "message" in error &&
    authStages.includes(error.stage as AuthStage) &&
    typeof error.message === "string"
  )
    return error.message;
  return "The account operation could not be completed. Please retry.";
}

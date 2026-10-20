import { invoke } from "@tauri-apps/api/core";
export type FriendAction =
  | "snapshot"
  | "find"
  | "send"
  | "accept"
  | "decline"
  | "cancel"
  | "remove"
  | "block"
  | "unblock";
export interface Relationship {
  kind: "friend" | "incoming" | "outgoing" | "blocked";
  account_id: string;
  username: string;
  display_name: string;
  since: string;
}
export interface FriendMatch {
  id: string;
  username: string;
  display_name: string;
  relationship: "none" | "friend" | "incoming" | "outgoing";
}
export interface FriendsView {
  accountId: string;
  entries: Relationship[] | null;
  matches: FriendMatch[];
  mutationApplied: boolean;
  warning: string | null;
}
export const friendsApi = {
  request: (action: FriendAction, target?: string, username?: string) =>
    invoke<FriendsView>("azuria_friends", {
      action,
      target: target ?? null,
      username: username ?? null,
    }),
};

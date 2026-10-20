# Friends database

The launcher now uses these operations for username lookup, requests, friend lists,
remove/block/unblock controls and pending-request notifications. It requires a
signed-in Azuria account and the existing friends migration. No new migration or
Edge Function is required for the launcher integration. Live presence and messaging
are not included yet.

## Apply it to your existing Supabase project

You already ran the accounts migration. Do not run that original migration again.

1. Open Supabase → SQL Editor → New query.
2. Copy the **entire** file:
   `services/accounts/supabase/migrations/202610200002_friends.sql`.
3. Run it once. A successful run creates the friends tables and functions in a
   single transaction. If it fails, the transaction rolls back; inspect the error
   before retrying. An already successful migration should not be rerun.
4. Keep row-level security enabled. No new keys, Edge Function secrets, SMTP
   settings or Vercel variables are needed.

The migration includes the `profiles.id` permission correction. Applying it is
safe even if you already ran that one-line grant manually. Profile RLS continues
to require the signed-in user's own ID, including after an update.

For a new database, run `202610200001_accounts.sql` first, then this migration.
For CLI-managed migrations, link the project and use `supabase db push` from
`services/accounts`. Do not mix manually applied and CLI migrations without
recording which migrations have already been applied.

## Storage and access

| Table                          | Purpose                                                   | What authenticated users can read |
| ------------------------------ | --------------------------------------------------------- | --------------------------------- |
| `friend_requests`              | Pending requests, sender, recipient and creation time     | Requests they sent or received    |
| `friendships`                  | One accepted relationship per ordered pair of account IDs | Their own friendships             |
| `user_blocks`                  | Accounts blocked by each user                             | Only their own block list         |
| `azuria_private.social_limits` | Small fixed-window request counters                       | Nothing                           |

The three public relationship tables have RLS enabled. Clients cannot insert,
update or delete rows directly; they call the functions below. Database constraints
prevent self-relationships, duplicate friendships and requests in both directions.
All relationship records are removed when their associated profile/account is
deleted. Counter rows are removed when their account is deleted.

The private schema must not be added to Supabase's API exposed schemas. Ordinary
users cannot access its helpers or counters. Existing profile RLS remains private;
we do not open the whole profile table to authenticated users.

## Authenticated operations

These RPCs derive the caller from `auth.uid()` and require a verified email and an
Azuria profile. They never accept a caller/sender/account-owner ID from the client.
Use the public publishable key **and the user's authenticated session**, never the
service-role key in the launcher or browser. SQL Editor calls have no user session
and are not a substitute for authenticated RPC tests.

| Function                 | Parameters                            | Behaviour                                                                                                 |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `find_friend`            | `p_username: text`                    | Exact username lookup; trims and lowercases input; returns ID, username, display name and relationship    |
| `send_friend_request`    | `p_target: uuid`                      | Sends a request to another verified profile                                                               |
| `respond_friend_request` | `p_sender: uuid`, `p_accept: boolean` | Recipient accepts or declines a pending request                                                           |
| `cancel_friend_request`  | `p_target: uuid`                      | Sender cancels their own outgoing request                                                                 |
| `remove_friend`          | `p_target: uuid`                      | Removes the caller's friendship for both people                                                           |
| `block_user`             | `p_target: uuid`                      | Blocks the target and removes requests/friendship in both directions                                      |
| `unblock_user`           | `p_target: uuid`                      | Removes only the caller's own block; does not restore friendship                                          |
| `friend_snapshot`        | None                                  | Returns the caller's friends, incoming/outgoing requests and blocked accounts with minimal profile fields |

`find_friend` returns no result for self, unknown usernames, unverified accounts
or a block in either direction. It does not reveal who blocked whom. Sending a
request to an unavailable or blocked account uses the same generic error.
Crossed requests stay pending; the recipient must explicitly accept. Acceptance
removes the request and creates the friendship in one transaction. Related writes
use the same pair advisory lock so acceptance, removal and blocking serialize.

`friend_snapshot` returns `kind`, `account_id`, `username`, `display_name`, `since`.
`kind` is `friend`, `incoming`, `outgoing` or `blocked`. It does not return email,
authentication metadata, online state or message history. Sort results in the
consumer; no ordering is promised by the database function.

## Request limits

- Exact lookup: 60 calls per account per fixed minute.
- Successfully sent friend requests: 20 per account per fixed hour, including
  requests subsequently cancelled or declined.
- Responses and block operations: 60 per action per account per fixed minute.

Counters use one row per account/action and are updated atomically. These are
application limits, not a replacement for Auth/API infrastructure limits. Failed
transactions roll back their counter updates. Limits use wall-clock windows,
not rolling windows. Unsuccessful anonymous traffic needs no private database
access and remains subject to Supabase's API infrastructure controls.

## Errors and upcoming client work

`42501` means the operation lacks an authenticated verified profile or a required
permission. `22023` means the chosen action/relationship is not valid anymore.
`P0001` is used for the application rate limit. The later launcher integration
should map these codes to readable messages and refresh its snapshot after
relationship changes or reconnecting.

No table is added to a realtime publication here. Presence-channel authorization,
private live notifications and refresh/session handling belong in the next stage
with their authenticated consumers. The launcher should not repeatedly poll these
tables.

## Verification

Run from the monorepo root:

```sh
npm run accounts:test
```

The tests run both migrations against embedded PostgreSQL and exercise real roles,
RLS, column permissions, exact lookup, recipient-only acceptance, decline/cancel,
blocking, removal, rate limits, snapshots and deletion cascades. They also reproduce
the profile upsert permission issue. Concurrent multi-connection behavior and live
Supabase integration still need verification in the deployed environment; the
local tests do not simulate a production realtime service.

## Launcher refresh and session handling

The native `azuria_friends` command accepts only a fixed set of actions and calls
these RPCs with the signed-in user's session. It refreshes the session and saves
rotated credentials in Windows Credential Manager before making authenticated
requests. Tokens never cross the Vue IPC boundary. Requests from the browser
preview do not call the live service.

The list loads after Azuria sign-in and refreshes on opening Friends, opening
Notifications, explicit refresh and successful relationship changes. There is no
background polling. Requests sent by someone else become visible on the next
refresh; realtime delivery and online status are a later stage.

Snapshots are kept only in memory and cleared on account changes/sign-out. Late
responses are discarded if they belong to an earlier account. If a mutation
succeeds but the follow-up snapshot fails, the UI reports that the change was saved
and asks for a refresh. It does not automatically repeat the mutation. A transport
failure may have an uncertain outcome; refresh before retrying.

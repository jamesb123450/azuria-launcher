# Azuria account service

Supabase migrations and the privileged `account-action` Edge Function for Azuria
accounts. Deploy from this directory after following
[the setup guide](../../docs/ACCOUNTS_SETUP.md).

The public website and native app do not receive administrative credentials.
Desktop authorization stores code hashes and PKCE challenges, never session tokens.
A consumed grant creates a distinct native session using Supabase’s server-side
magic-link generation and verification APIs; no email is sent for that exchange.
The browser must already be authenticated with a verified email to issue a grant.
Account deletion requires a verified session and fresh password authentication.

No database or function is provisioned by a source-code build.

## Database history

The existing production database is already migrated. Do not rerun applied SQL.
Keep `supabase/migrations/`: these files are the ordered schema history, are used
by the account tests, and are needed to create a fresh environment. New schema
changes belong in a new migration, not edits to previously applied files.

## Friends

The launcher supports username lookup, requests, friend lists, removal and blocking.
Live presence and messaging are not enabled. No additional deployment is required
for the already-applied friends migration.

### Storage and access

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

### Authenticated operations

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

### Request limits

- Exact lookup: 60 calls per account per fixed minute.
- Successfully sent friend requests: 20 per account per fixed hour, including
  requests subsequently cancelled or declined.
- Responses and block operations: 60 per action per account per fixed minute.

Counters use one row per account/action and are updated atomically. These are
application limits, not a replacement for Auth/API infrastructure limits. Failed
transactions roll back their counter updates. Limits use wall-clock windows,
not rolling windows. Unsuccessful anonymous traffic needs no private database
access and remains subject to Supabase's API infrastructure controls.

### Launcher refresh and session handling

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

## Administration

The third migration and separate `admin-action` function protect the shared account
website’s admin area. Follow [the admin setup guide](../../docs/ADMIN_SETUP.md) for
role assignment, function deployment and authenticator setup. No administrator is
created automatically; roles are granted only through trusted Supabase access.

## News

The news migration adds admin publishing, private drafts and public image storage.
Follow [NEWS_SETUP.md](../../docs/NEWS_SETUP.md) to apply the migration and connect
both the launcher website and desktop feed. Publishing requires the live admin
role and MFA; readers do not need an account.

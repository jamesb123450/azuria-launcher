# Launcher messaging

Messaging uses the existing Supabase project and Azuria sign-in. No new keys or providers are required.

## Enable after merging

1. Open Supabase → SQL Editor.
2. Run `services/accounts/supabase/migrations/202610240003_messaging.sql` once, after the existing accounts and friends migrations.
3. Install the new launcher build on two accounts, verify their emails, and accept a friend request.
4. Click a friend in the right sidebar, or open Friends → Message. Send a message, reply from the other account, refresh, and check older history.

No Edge Function deployment or Realtime publication change is needed. Existing Supabase public URL/key settings remain unchanged. Never put a service-role key in the launcher or its frontend.

## Behaviour

- Text only, up to 2,000 characters; 30 new messages per sender per minute.
- Friends can read their shared history. Removing or blocking a friend revokes access and sending in both directions. Restoring the friendship restores access to the existing history.
- History loads 50 messages at a time; read markers apply through the newest message fetched by the recipient.
- Opening Friends loads unread counts. While the panel is open and the app is visible, it refreshes every 15 seconds. Closed/hidden panels do not poll. There are no background push notifications, typing indicators or online-status claims.
- Failed sends keep the draft. Retrying unchanged text uses the same request ID to prevent duplicates after an uncertain network response.
- Message text is rendered as plain text. HTML and links are not executed.
- Messages are stored in Supabase, are not end-to-end encrypted, and may be accessible to operators with database access. No admin message viewer is provided. Deleting an account cascades deletion of its messages; there is no automatic retention expiry or individual message deletion in this version.

## Access controls

The database derives the sender from the verified JWT, checks accepted friendship and blocks on every request, and exposes only fixed RPCs. Authenticated clients cannot read or mutate the table directly. Pair locks serialize sending with block/removal operations. The native app owns authentication tokens; message bodies and tokens are not logged.

## Checks

`node --test apps/accounts/frontend/tests/messaging.test.mjs` exercises the migration using PostgreSQL-compatible PGlite, including permissions, spoofing, retries, unread markers, blocking, validation, pagination and rate limits.

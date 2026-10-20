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

## Friends database

The second migration adds authenticated friend requests, friendships, blocks and
request limits, and includes the profile-upsert permission correction. Follow
[the friends database guide](../../docs/FRIENDS_DATABASE.md) to apply it to an
existing project. No launcher UI, presence or messaging is enabled by this migration.

# Azuria account service

Supabase schema and Edge Functions for Azuria accounts. Follow the
[account setup guide](../../docs/ACCOUNTS_SETUP.md) for configuration and deployment.
No database or function is provisioned by a source-code build.

## Database setup

`supabase/schema.sql` is the current schema for a **fresh Supabase project only**.
It includes account handoff, profiles, friends, encrypted messaging, administration,
news, signup consent, archived feedback and advertisements, with their permissions,
RLS policies, triggers and storage buckets. It contains no user data or admin grants.
For the cape wardrobe foundation, apply `supabase/cosmetics.sql` after the base
schema; see [cosmetics setup](../../docs/COSMETICS_SETUP.md).
Historical migrations have been removed for beta. Account tests load this same
snapshot into isolated PostgreSQL with Supabase platform stubs.

The existing production database needs no changes. Do not rerun this snapshot
against an existing database or use it as an incremental upgrade. Future database
changes must have a separately reviewed deployment procedure.

## Operations

- [Account configuration and signup consent](../../docs/ACCOUNTS_SETUP.md)
- [Admin access and MFA](../../docs/ADMIN_SETUP.md)
- [News publishing](../../docs/NEWS_SETUP.md)
- [Messaging and key recovery](../../docs/MESSAGING_SETUP.md)
- [Advertisement management](../../docs/ADVERTISEMENT_SETUP.md)
- [Archived survey results](../../docs/FEEDBACK_SETUP.md)

The public website and native app never receive administrative credentials.
Desktop authorization stores code hashes and PKCE challenges, never session tokens.
A consumed grant creates a distinct native session using Supabase's server-side
magic-link generation and verification APIs; no email is sent for that exchange.
Account deletion requires a verified session and fresh password authentication.

Run `npm run accounts:build` and `npm run accounts:test` from the repository root.
Edge Function deployment commands and secrets are documented in the setup guide.

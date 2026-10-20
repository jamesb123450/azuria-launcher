# Azuria Account

Shared account pages for **accounts.azuriasmp.org**, deployed separately on Vercel.

From the monorepo root:

```sh
npm ci
npm run accounts:build
npm run accounts:test
npm run dev --workspace=azuria-accounts-website
```

Copy `.env.example` to `.env.local` and provide public Supabase configuration for
local development. Without configuration, the site displays a setup state rather
than pretending accounts work.

See [the setup guide](../../../docs/ACCOUNTS_SETUP.md) for database migration,
email templates, server-function deployment, DNS and credential storage.

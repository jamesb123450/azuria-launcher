# Set up Azuria accounts

The account website lives in `apps/accounts/frontend`. Supabase hosts authentication,
PostgreSQL and the `account-action` server function. The production account address
is **https://accounts.azuriasmp.org**. Neither PostgreSQL nor Docker is needed on
users’ computers. The database is not hosted by Vercel.

## 1. Create the database

1. Create a project at https://supabase.com/dashboard. Choose a suitable region
   (for example London), and generate a strong database password. Save that password
   in your password manager; the launcher and website do not need it.
2. In the project’s SQL Editor, open a new query, paste the contents of
   `services/accounts/supabase/migrations/202610200001_accounts.sql`, and run it once.
   The migration is transactional and is intended for a new project. Do not rerun
   it against an existing migrated database.
3. Under Authentication, enable email/password registration and **Confirm email**.
   Set the minimum password length to **12**. Keep secure email changes and secure
   password changes enabled. No Google or Microsoft provider is needed for this release.
4. Set the Auth **Site URL** to `https://accounts.azuriasmp.org` and allow exactly:
   - `https://accounts.azuriasmp.org/confirm/`
   - `https://accounts.azuriasmp.org/reset/`
5. For development only, also allow `http://localhost:1421/confirm/` and
   `http://localhost:1421/reset/`. Do not broadly allow all Vercel preview domains.
6. Keep the default API-exposed schemas; do not expose `auth`. Both application
   tables have row-level security. Ordinary users can read/edit only their own
   profile and cannot access desktop connection records or privileged functions.

`profiles` stores the account ID, username, display name and creation time.
Authentication data and password hashes stay in Supabase Auth. Profile creation
happens after verification: a taken username never breaks email registration.
There are no friends or messaging tables yet.

Alternatively, with the Supabase CLI, run `supabase db push` from `services/accounts`
after linking the project. **Use either the SQL Editor or CLI for the initial
migration, not both.** If you already used the editor and later adopt CLI migrations,
mark the migration as applied before pushing.

## 2. Configure account emails

Configure a production SMTP provider in Supabase Authentication → Email/SMTP.
Use a sender such as `accounts@azuriasmp.org` and add the provider’s SPF/DKIM DNS
records. Add DMARC following your mail provider’s instructions. SMTP credentials
belong in Supabase’s SMTP settings, not Vercel or the launcher.

Use these links in the corresponding Supabase email templates:

**Confirm signup**

```html
<a href="{{ .SiteURL }}/confirm/?token_hash={{ .TokenHash }}&type=signup"
  >Verify your email</a
>
```

**Reset password**

```html
<a href="{{ .SiteURL }}/reset/?token_hash={{ .TokenHash }}&type=recovery"
  >Reset your password</a
>
```

The account page removes the token from the address bar immediately and requires a
Continue click before consuming it. This reduces accidental consumption by link
scanners and allows email links to work in another browser. Do not add email click
tracking that rewrites these links. No analytics scripts run on account pages.

## 3. Deploy the server function

The code is in `services/accounts/supabase/functions/account-action/index.ts`.
Supabase provides the function’s `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
The service-role key must **never** appear in website or launcher build variables.

Set these function environment secrets in the Supabase dashboard:

| Name                              | Value                                        |
| --------------------------------- | -------------------------------------------- |
| `AZURIA_SUPABASE_PUBLISHABLE_KEY` | Your project’s public `sb_publishable_…` key |
| `AZURIA_ACCOUNT_ORIGINS`          | `https://accounts.azuriasmp.org`             |

From `services/accounts`, deploy using the Supabase CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy account-action
```

The committed `supabase/config.toml` sets `verify_jwt = false` for this function.
This is intentional: the code redemption endpoint has no session yet. The handler
independently verifies the user’s bearer token for authorization and deletion.
Never remove those checks. If deploying through the dashboard instead, disable
legacy gateway JWT verification for **this function only**.

The website is allowed to call the function only from the configured origin.
For local website testing, append `,http://localhost:1421` to the origins value.
Native requests have no browser Origin and prove possession of the single-use code
and the launcher’s private verifier instead.

## 4. Deploy the account website on Vercel

1. Import the existing monorepo as an additional Vercel project.
2. Set **Root Directory** to `apps/accounts/frontend`. Permit access to files
   outside that directory if Vercel asks, since npm uses the root workspace lockfile.
3. Use the Vite framework preset, build command `npm run build`, output `dist` and
   Node.js **24**. If overriding Install Command, run `npm ci` from the repository
   root so the workspace lockfile is used. The committed `vercel.json` contains
   route rewrites, security headers and no-store caching.
4. Set the public build variables:
   - `VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY`
5. Add `accounts.azuriasmp.org` under Vercel Domains. At your DNS provider, create
   the **accounts** record using the exact target Vercel displays. Keep the existing
   root domain and launcher records intact. Wait for Vercel to issue HTTPS.
6. Redeploy after adding or changing environment variables. They are read at build time.

A build without these variables shows an honest “Accounts are being set up” state.
Do not put database passwords, JWT signing secrets, SMTP passwords or administrative
keys in any `VITE_*` variable: everything with that prefix can reach the browser.
The CSP currently permits the standard `https://*.supabase.co` API endpoint;
update it deliberately if you later use a custom Supabase API domain.

## 5. Configure launcher builds

In GitHub → repository Settings → Secrets and variables → Actions → **Variables**,
add:

| Repository variable               | Value                              |
| --------------------------------- | ---------------------------------- |
| `AZURIA_SUPABASE_URL`             | Same project URL as the website    |
| `AZURIA_SUPABASE_PUBLISHABLE_KEY` | Same public `sb_publishable_…` key |

The launcher workflow passes these into Rust at build time. They are intentionally
public and are embedded in the installed app. Rebuild the launcher after setting
them. No service-role key or database password belongs in GitHub for this feature.
The example `apps/app/.env.example` lists the variables, but Cargo does not read an
`.env` file automatically: set them in the shell used to start or build the app.

Users sign in through their browser, explicitly approve the launcher connection,
copy its 43-character code and paste it into launcher Settings → Profile → Azuria
account. There is no polling. The code expires in two minutes and works only with
the launcher request that created its PKCE challenge. The initial request expires
in 15 minutes; users can start again if necessary.

After redemption, an independent launcher session is created. Its refresh token is
saved in **Windows Credential Manager**, under `com.azuria.launcher.azuria` /
`refresh-token`. It is separate from the Microsoft credential and never returned
to the Vue frontend. Tokens are refreshed when account status is requested, not
by a background polling timer. Signing out removes the local credential even when
offline; remote revocation is best effort. Use “Sign out other sessions” on the
account site to revoke other refresh sessions; already-issued access tokens can
remain valid until expiry.

The browser stores its session in **sessionStorage**, scoped to the account site
and browser tab. Closing the tab ends that browser’s saved login. This avoids
persistent browser storage while still allowing reloads and email confirmation.

## Where sensitive details belong

| Detail                                   | Store it here                                                                | Never put it here                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Supabase project URL and publishable key | Vercel build variables; GitHub Actions Variables for launcher                | They are public, so they cannot grant administrative access   |
| Database password                        | Password manager; interactive CLI prompt when needed                         | Source files, frontend variables or launcher                  |
| Service-role / Supabase secret key       | Supabase server-function environment only                                    | `VITE_*`, launcher build environment, committed files or chat |
| SMTP password / API key                  | Supabase SMTP settings                                                       | Frontend, launcher or public environment variables            |
| Supabase CLI access token                | Local CLI credential storage, or an appropriate CI secret if automated later | Source files or shell command arguments                       |
| A user’s launcher refresh token          | Windows Credential Manager                                                   | JSON settings, browser storage, logs or crash reports         |
| Local configuration                      | Ignored `.env.local` files for Vite, shell environment for Rust              | `.env.example` or Git commits                                 |

Do not send secrets in chat. `.env.example` contains placeholders only. The
repository already ignores real `.env` and `.env.*` files. Supabase CLI’s `.temp/`
working state is also ignored. If a real secret is committed, rotate it; deleting
the file from the current branch does not remove it from history.

## Verify before enabling accounts publicly

- Register and verify using a real inbox; test recovery in another browser.
- Claim a username; confirm duplicates and another user’s profile changes are rejected.
- Connect a Windows launcher, restart it and verify the saved session restores.
- Try reusing a code, waiting for expiry and using a code in a different launcher.
- Revoke other sessions; confirm a restart requires reauthentication.
- Disconnect the network; confirm local Minecraft functionality still works.
- Delete a test account after confirming its password; verify its profile disappears.
- Review your actual contact options, legal copy, SMTP delivery and Supabase Auth
  rate limits before opening registration. These legal pages describe this account
  implementation and should reflect any later analytics or social features.

The account tests run the migration against embedded PostgreSQL and check its RLS,
privileged functions, expiry, replay protection, rate limits and deletion cascades.
The function tests exercise request authorization and session issuance with mocked
Supabase responses, without production credentials. Run them with:

```sh
npm run accounts:test
deno check services/accounts/supabase/functions/account-action/index.ts
deno test --allow-env services/accounts/supabase/functions/account-action/index.test.ts
```

Desktop native compilation and live-provider tests require the normal Windows
build and a configured Supabase project. Builds and local automated tests do not
claim that those external services are already configured.

## References

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- https://supabase.com/docs/reference/javascript/auth-admin-deleteuser

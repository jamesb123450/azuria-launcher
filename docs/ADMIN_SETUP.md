# Enable Azuria administration

The administration area is **https://accounts.azuriasmp.org/admin**. It supports
account counts, paginated account search, suspension/restoration and an audit
history. The sidebar separates Overview, Accounts and Activity Log. Reports,
Products, Announcements, Analytics and Settings show planned tools marked Coming
soon; their action controls are disabled and do not save or publish anything.
Overview totals and recent activity come from the existing authenticated RPCs.
There are no fabricated charts or placeholder user counts. Navigation fetches
only the data used by that section, without background polling.

Passwords, private messages, role promotion and account deletion are not
available in this admin area. Reports will be added when reporting exists.

## 1. Apply the new SQL migration

In Supabase → SQL Editor → New query, run the entire file:

`services/accounts/supabase/migrations/202610200003_admin.sql`

Apply this once, after migrations `202610200001_accounts.sql` and
`202610200002_friends.sql`. Do not rerun previous successful migrations. The new
migration is transactional. It does not grant anyone admin access automatically.

## 2. Grant your existing account access

Sign up normally and verify your email first. In Supabase SQL Editor, replace
`YOUR_AZURIA_USERNAME` with your actual lowercase Azuria username, then run:

```sql
insert into public.admin_roles (user_id)
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where p.username = 'YOUR_AZURIA_USERNAME'
  and u.email_confirmed_at is not null
on conflict (user_id) do nothing
returning user_id;
```

A returned UUID confirms a new grant. If no row is returned, check the username,
email verification, and whether the role already exists:

```sql
select p.username, r.user_id
from public.admin_roles r
join public.profiles p on p.id = r.user_id;
```

Only trusted project owners should use this SQL. There is no public API or website
control for promotion. Roles do not come from profile fields, user metadata or a
browser variable. Never add an `admin` flag to editable profile metadata as an
access-control mechanism.

To revoke access, delete the corresponding row in SQL Editor:

```sql
delete from public.admin_roles
where user_id = (
  select id from public.profiles where username = 'YOUR_AZURIA_USERNAME'
);
```

Every privileged request checks the live role, current non-suspended user and live
Auth session. Revocation does not depend on hiding navigation or waiting for the
browser's cached role to refresh. Finish any in-flight moderation work before
changing roles.

## 3. Deploy the admin server function

Create another Supabase Edge Function named **`admin-action`**. Its entry file must
be **`index.ts`**. Paste the entire contents of:

`services/accounts/supabase/functions/admin-action/index.ts`

Deploy it with gateway **Verify JWT disabled for this function**. Its handler
validates the user token, then calls a database function with the user's own JWT.
That database function requires the role, live session, MFA and recent password.
Only after this check succeeds does the handler use the service-role key.

It uses the same existing function secrets as `account-action`:

- `AZURIA_SUPABASE_PUBLISHABLE_KEY`
- `AZURIA_ACCOUNT_ORIGINS=https://accounts.azuriasmp.org`

Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not copy the
service-role key to Vercel, GitHub build variables or the browser.

CLI alternative, from `services/accounts`:

```sh
npx supabase functions deploy admin-action
```

## 4. Enable authenticator MFA and redeploy the website

In Supabase Authentication → Multi-Factor, enable enrollment and verification for
**TOTP / authenticator apps**. The admin page uses Supabase's MFA APIs; no separate
MFA service or shared admin password is needed.

Redeploy the account website on Vercel after merging the code. Existing environment
variables are sufficient. Sign in, then select **Administration**, or visit `/admin`.
The page asks for your password, then guides you through adding an authenticator
app or entering an existing authenticator code. Store your authenticator backup
securely. Do not share the enrollment QR code, secret or one-time codes.

Admin data requires an `aal2` session. Suspension/restoration additionally requires
a password authentication recorded in the signed JWT within the last ten minutes.
The **Verify access again** control repeats the password/authenticator flow.
Ordinary Azuria accounts do not need to enroll MFA for normal account use.

If you lose your authenticator, recover it through Supabase's trusted project-owner
administration process. Do not add an MFA bypass to the website. No recovery-code
system is supplied by this implementation.

## Moderation and audit behaviour

- Account search returns at most 25 records per page. Email and username matching
  uses a literal prefix; an exact UUID can also be searched. Pages are bounded at
  offset 10,000. No bulk export or full Auth user objects are returned.
- Your own account and all accounts with an admin-role row are protected from
  suspension/restoration through the admin area, including direct RPC attempts.
- Both operations require a reason and an explicit account-ID confirmation in the
  website. Server-side checks enforce authorization regardless of the browser UI.
- Suspension uses Supabase Auth's `ban_duration` of `876000h` (approximately 100
  years). Restoration removes the ban. It prevents new sign-ins and token renewal;
  already-issued tokens can retain some ordinary account access until expiry.
  Friends RPCs and admin RPCs also check current suspension state immediately.
  Local Minecraft files, the Minecraft licence and offline local functionality
  are unaffected.
- The database stores an audit intent **before** the Auth API is called. After a
  confirmed API result, the service finalizes it as succeeded or failed. Account
  data and the audit are not one distributed transaction.
- Timeouts, server failures or inability to save the final audit leave the record
  **pending**. The same target cannot be changed again until that record is
  reconciled, so the UI never reports unconfirmed success or blindly retries.
- Audit rows retain actor/target UUIDs, reason, action, outcome and timestamps after
  account deletion. Do not include passwords, tokens or unnecessary personal data
  in reasons. Search/read activity is not included in this moderation audit.

### Reconcile a pending action

As a trusted project owner, open the affected user in Supabase Authentication and
check whether the intended ban/restoration was applied. Inspect the audit row in
SQL Editor. Only after verifying the actual outcome, finalize its specific UUID:

```sql
-- true only if the intended action is confirmed applied; otherwise false.
select public.admin_finish_action('AUDIT_RECORD_UUID'::uuid, true);
```

That function is available only to the service role/project owner, not to ordinary
clients or admins calling the public API. A pending entry is evidence of an
uncertain result, not evidence that the account was or was not changed.

## Verification

```sh
npm run accounts:test
npm run accounts:build
deno check services/accounts/supabase/functions/admin-action/index.ts
deno test --allow-env services/accounts/supabase/functions/admin-action/index.test.ts
```

Database tests use embedded PostgreSQL with Auth-shaped fixtures to exercise role
isolation, live-session checks, MFA, password freshness, protected targets, audit
access and retention. Function tests mock Supabase responses and check that denied
requests cannot reach the privileged API and uncertain results remain pending.
Live authenticator enrollment, real Auth suspension, and browser visual verification
still require the deployed services and interactive testing.

References:

- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- https://supabase.com/docs/guides/auth/sessions

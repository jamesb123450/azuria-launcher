# Launcher feedback survey

The studio homepage invites visitors to `/survey/`. Each of the six questions
accepts multiple choices. Dismissing or opening the invitation is remembered in
that browser; the footer always links to the survey. The invitation waits for
the existing privacy banner to close. It is not shown on legal or survey pages.

## Enable collection

1. Run `services/accounts/supabase/migrations/202610240001_feedback.sql` in the
   existing Supabase project's SQL editor. Apply the earlier account, friends
   and admin migrations first if this is a new database.
2. In Cloudflare, create a **Turnstile** widget for the studio site's actual
   hostname (for example `azuriasmp.org` and `www.azuriasmp.org`). Use Managed
   mode. Turnstile does not require moving your domain to Cloudflare DNS.
3. Add these **public values to the Azuria Studios Vercel project**, then redeploy:

   | Variable                          | Value                                                 |
   | --------------------------------- | ----------------------------------------------------- |
   | `AZURIA_SUPABASE_URL`             | The same HTTPS Supabase project URL used for accounts |
   | `AZURIA_SUPABASE_PUBLISHABLE_KEY` | Its public publishable key                            |
   | `AZURIA_TURNSTILE_SITE_KEY`       | The Turnstile widget's public site key                |

4. In **Supabase → Edge Functions → Secrets**, add:

   | Secret                        | Value                                                                                                            |
   | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
   | `AZURIA_TURNSTILE_SECRET_KEY` | The widget's private secret key                                                                                  |
   | `AZURIA_FEEDBACK_ORIGINS`     | Exact permitted site origins, separated by commas; defaults to `https://azuriasmp.org,https://www.azuriasmp.org` |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase to its
   hosted functions. Never put the service-role key or Turnstile secret in
   Vercel's website variables, browser code, or GitHub files.

5. From the repository root, deploy the function to the existing project:

   ```sh
   npx supabase functions deploy feedback-submit --project-ref YOUR_PROJECT_REF
   ```

   The committed `config.toml` disables gateway JWT verification for this public
   endpoint. The handler checks Turnstile's result, action and hostname; database
   writes remain available only to the service role.

6. Merge/deploy the websites. Open `/survey/`, complete and submit a test response,
   then verify it at `https://accounts.azuriasmp.org/admin#feedback` after the
   usual password and authenticator checks. Verify that a public database client
   cannot select `launcher_feedback` or call either admin feedback RPC.

Missing public configuration disables sending with a clear message. Never use
Cloudflare's testing keys on production; they are only appropriate for isolated
test environments. Preview domains need their own allowed origins/widget setup.

## Response handling

Records contain a random retry reference, version, selected option IDs and a
calendar date. They contain no account IDs, email addresses, IPs, user agents,
challenge tokens or free text. Infrastructure providers may retain technical
request logs separately. The website's privacy policy explains this distinction.
A repeated submission reference cannot overwrite an existing response.

Only admins with a live role and MFA can read results. Summary percentages use
the response count as the denominator; totals may exceed 100% because questions
allow several choices. Individual responses are paginated in batches of 25.
There is a 5,000-response daily safety cap, not a guarantee against every form
of survey manipulation. Anonymous surveys do not prove one response per person.

Review responses when the survey closes and delete them when no longer needed.
To stop new collection, remove the Turnstile secret or disable the Edge Function.
To hide the invitation while keeping the survey link, remove the homepage
invitation block from `src/survey.js`.

For a new questionnaire, introduce a new version with a matching migration;
do not reinterpret the stored option IDs. The database tests check that the
website definition and server schema agree.

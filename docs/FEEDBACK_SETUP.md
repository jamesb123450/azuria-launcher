# Closed launcher feedback survey

The public survey is retired. The Studios homepage no longer shows its invitation or footer link, and no survey JavaScript, styles, configuration or bot widget are included in website builds. Old `/survey/` links show a short closed notice without a form; that route is excluded from the sitemap and marked `noindex`.

## Existing results

Previously submitted answers and written feedback remain in `public.launcher_feedback`. The existing `feedback_admin_summary` and `feedback_admin_responses` RPCs, live admin-role checks, MFA requirements and dashboard are retained. Review results at https://accounts.azuriasmp.org/admin#feedback using the usual admin sign-in. The archived question definitions remain in the database schema to interpret the original answer IDs. No migration, deletion, schema change or result reset is required.

## Deployment

Deploy the Studios and Accounts websites through their normal Vercel projects after the PR is merged. To reject submissions from cached forms as well, deploy the retired endpoint from the repository root:

```sh
npx supabase functions deploy feedback-submit --workdir services/accounts --project-ref YOUR_PROJECT_REF
```

The endpoint responds to submissions with HTTP 410 and `survey_closed`, without reading the request body, calling Turnstile, connecting to the database or writing responses. Until that function is redeployed, the previously deployed endpoint may still accept cached forms. No account or admin service needs to be removed. Keep the database and admin RPCs intact.

Public survey build variables and Turnstile settings are no longer used by the website; account and admin configuration is still required. Do not remove shared Supabase settings from the Accounts project. Existing stored comments are shown as plain text in the dashboard and remain subject to the stated retention policy.

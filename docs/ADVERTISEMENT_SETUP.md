# Direct sponsor advertisements

After merging, run `services/accounts/supabase/migrations/202610250001_advertisements.sql` once in the existing Supabase project's SQL Editor. Earlier accounts, admin and news migrations must already be applied. This creates the sponsor tables, public read RPC, admin-only write RPC and public `sponsor-images` upload bucket. No new keys, Edge Functions or advertising network are needed.

Deploy the accounts website and install the new launcher release. Existing `AZURIA_SUPABASE_URL` and `AZURIA_SUPABASE_PUBLISHABLE_KEY` build settings are reused. Never add a service-role key to the launcher or website.

Open the accounts website → Admin → Advertisements. Administrator access requires the existing authenticator verification.

1. Create advertisement. Enter the sponsor/campaign name, an HTTPS destination and an image description.
2. Upload square PNG, JPG or WebP artwork, no more than 2 MB. Around 600 × 600 pixels works well. Uploads use public, immutable URLs, including drafts.
3. Set Start and optionally End, in your browser's local time zone. End is exclusive. Dates are saved as UTC instants.
4. Select one or more labelled placements in the page previews:

| Page                                   | Upper square  | Lower square     |
| -------------------------------------- | ------------- | ---------------- |
| Home                                   | `home.top`    | `home.bottom`    |
| Saved profiles (right sidebar visible) | `library.top` | `library.bottom` |
| Social                                 | `social.top`  | `social.bottom`  |
| Game monitor                           | `monitor.top` | `monitor.bottom` |

5. Enable campaign and save. Leave it disabled to keep a draft. Edit and uncheck Enable to pause it. Ended campaigns remain editable.

The server rejects overlapping enabled date ranges sharing any slot. Adjacent ranges with one ending exactly when the next starts are permitted. Disabling a campaign frees its slots. Edits use revision checks so another administrator's changes cannot be silently overwritten.

The launcher fetches only currently active campaigns without accessing an account session. A shared cache avoids duplicate slot requests. It refreshes on page mount, focus/visibility changes (at most once per minute), and every five minutes while visible. New campaigns, pauses and edits may therefore take up to five minutes to appear in an open visible launcher. Known end times hide artwork on time locally. Restart/refocus after a minute for an earlier refresh. Offline or missing setup shows the existing placeholder; failed artwork uses the same fallback. No clicks or impressions are recorded. Clicks open the default browser, never an embedded page. Sponsor content is static raster artwork; third-party scripts and HTML are not accepted.

The dashboard displays the most recently updated 200 campaigns. There is no billing, automatic sponsor signup, analytics or asset deletion in this version. Database write history records the administrator and revision. Keep artwork and destination rights agreed with the sponsor separately.

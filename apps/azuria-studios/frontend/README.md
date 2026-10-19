# Azuria Studios website

Independent static studio site. The launcher website in `apps/frontend` is unchanged.

From the repository root:

```sh
npm run studios:build
npm run studios:preview
```

## Vercel

Import the repository as a separate Vercel project. Set **Root Directory** to `apps/azuria-studios/frontend`, **Framework Preset** to Other, **Build Command** to `npm run build`, and **Output Directory** to `dist`. The included `vercel.json` supplies build settings and security headers. No environment variables or backend are required. Do not select the launcher website's root directory.

## Privacy and cookies

All fonts and images are local. Optional Google Analytics loads only after explicit analytics consent. No advertising or embeds are included. The first-visit banner offers equally prominent accept/reject actions; Cookie settings reopens it on every page. Consent is scoped to this site's measurement ID, expires after 180 days and is separate from requested theme preferences. Blocked storage does not break the controls. Withdrawing analytics consent disables collection, clears accessible GA cookies and reloads to stop the loaded tag. Other open tabs also apply changed choices. Old pre-analytics consent records are not accepted.

The privacy contact links to the existing launcher contact page. Update it when a dedicated studio contact channel is available. Review policy details whenever data collection or hosting changes.

## Assets

Azuria brand assets and launcher screenshot are included locally. Inter is distributed under the included `assets/INTER-LICENSE.txt`. The launcher screenshot contains Minecraft scenery from Karbin_Drem's Distant Shaded Panoramas, licensed CC BY-SA 4.0: https://modrinth.com/resourcepack/karbin-panoramas and https://creativecommons.org/licenses/by-sa/4.0/. The screenshot shows the Azuria interface over that scenery. Minecraft is a trademark of Mojang/Microsoft; this site is not affiliated with them.

## Google Analytics (GA4)

In this website's **Vercel project → Settings → Environment Variables**, add:

```text
AZURIA_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Use the GA4 web stream's measurement ID, not the whole Google script or a GTM container ID. Redeploy after adding, changing or removing the value. Leave it unset to disable analytics. Set it separately for each Vercel project; separate web streams are recommended for the two websites. Enable only in the deployment environments you want measured, normally Production. No secret key is needed.

The static build validates the ID and includes it in the local consent script. Google is never contacted by this integration until a visitor accepts analytics (basic consent mode). Advertising consent remains denied; Google signals and ad personalisation are disabled. Initial page-view URLs omit query strings/fragments. Review GA4's enhanced-measurement settings before enabling features that could collect URLs or user-entered information. Analytics preferences are separate from AdSense's certified consent controls; accepting analytics does not authorise advertising.

Changing the ID requests fresh consent. Cookie settings allows withdrawal. Preferences are local to each origin and website. Set an appropriate retention period in GA4; removing the tag does not delete data already held by Google. Google documentation: https://developers.google.com/tag-platform/security/guides/consent

## Analytics browser checks

From the repository root, build both sites with the test measurement ID and run:

```sh
AZURIA_GA_MEASUREMENT_ID=G-ABCDE12345 npm run website:build
AZURIA_GA_MEASUREMENT_ID=G-ABCDE12345 npm run studios:build
node tests/website-analytics.browser.mjs
```

Uses Playwright from the existing launcher frontend development dependencies. Install its Chromium browser first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Google requests are intercepted locally; the test sends no analytics to Google. Studio preview includes the Vercel security headers.

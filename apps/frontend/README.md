# Azuria website

The public launcher website uses a static build, local fonts and existing Azuria assets. No frontend framework or animation library is required.

From the repository root:

```sh
npm ci
npm run website:test
npm run website:preview
```

The preview follows the canonical base URL in the built site. Set `AZURIA_SITE_URL=https://launcher.azuriasmp.org/` when building for the custom domain. Vercel uses this directory as its Root Directory and `dist` as its output.

## Presentation

`src/homepage.mjs` owns the homepage sections, while `src/pages.mjs` owns shared navigation/footer, secondary pages and validated release links. `src/site.css` supplies the existing shared layout; `src/premium.css` adds the approved dark presentation and responsive homepage styling. Keep legal text readable and preserve the scenery attribution in the footer.

The hero uses the existing static cherry-grove image, real Azuria icon and real launcher captures. The appearance control changes the launcher screenshot, not the website theme. Release information and downloads retain their public GitHub source and fallback behaviour.

## Motion and accessibility

`src/motion.mjs` progressively enhances the already visible page. Scroll reveals run once; reduced-motion preferences disable or cancel motion. The screenshot switch decodes the next image before committing, then crossfades it with a slight scale transition. A request counter prevents stale image loads from replacing newer selections. Failed loads retain the screenshot and accessible selection and provide retry feedback.

Keep outgoing screenshot layers decorative, reserve image dimensions, retain visible keyboard focus, and never make content depend on animation or JavaScript. The website tests cover theme-load races, failures, reduced-motion changes, release validation, generated links and policy rendering. Automated accessibility scans complement keyboard, mobile, text-spacing and assistive-technology review; they do not establish full WCAG conformance by themselves.

## Google Analytics (GA4)

In this website's **Vercel project → Settings → Environment Variables**, add:

```text
AZURIA_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Use the GA4 web stream's measurement ID, not the whole Google script or a GTM container ID. Redeploy after adding, changing or removing the value. Leave it unset to disable analytics. Set it separately for each Vercel project; separate web streams are recommended for the two websites. Enable only in the deployment environments you want measured, normally Production. No secret key is needed.

The static build validates the ID and includes it in the local consent script. Google is never contacted by this integration until a visitor accepts analytics (basic consent mode). Advertising consent remains denied; Google signals and ad personalisation are disabled. Initial page-view URLs omit query strings/fragments. Review GA4's enhanced-measurement settings before enabling features that could collect URLs or user-entered information. Analytics preferences are separate from AdSense's certified consent controls; accepting analytics does not authorise advertising.

Changing the ID requests fresh consent. Cookie settings allows withdrawal. Preferences are local to each origin and website. Set an appropriate retention period in GA4; removing the tag does not delete data already held by Google. Google documentation: https://developers.google.com/tag-platform/security/guides/consent

## Current interface captures

The JPEG captures in `assets/` were refreshed from the launcher frontend after the portrait Versions catalogue and live appearance previews were added. Home is used for the hero, social preview and dark/light comparison; Versions shows the portrait cards and right launch panel. Captures are 1280×900 and use sample local setups. The skin screen uses the official Steve texture as sample data. No screenshot is generated or composited. Source credits are in `assets/MINECRAFT-CREDIT.txt`.

## News publishing

The home page and `/news/` load published stories at runtime. Follow
[the news setup guide](../../docs/NEWS_SETUP.md) for the database migration,
public build variables and admin editor. Publishing does not require a website
redeploy. Article URLs use `/news/?story=slug` for static hosting compatibility.

## Google Search

Page titles, descriptions, canonical URLs and social preview tags are built into
the HTML. See [search setup](../../../docs/WEBSITE_SEARCH_SETUP.md) for production
domains, the optional Search Console verification token and sitemap submission.

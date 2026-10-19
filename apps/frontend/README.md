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

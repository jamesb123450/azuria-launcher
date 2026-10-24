# Google Search setup

Both public websites include page-specific titles and descriptions, canonical
URLs, Open Graph and Twitter preview metadata, robots tags, favicons, robots.txt
and XML sitemaps. These are present in the built HTML; search crawlers do not
need to run the consent or analytics scripts to read them. The 404 documents are
marked noindex, as are Vercel preview/development builds.

## Production domains

- Studios defaults to `https://www.azuriasmp.org/`.
- Launcher defaults to `https://launcher.azuriasmp.org/` on Vercel. The GitHub
  distribution build preserves its `/azuria-releases/` asset paths but declares
  the primary launcher domain in canonical tags and its sitemap.
- Existing `AZURIA_SITE_URL` values take precedence. In each Vercel project,
  check that this variable, if set, uses that project's production domain,
  not a preview deployment or the old GitHub Pages URL. Studio origin overrides
  cannot include a subdirectory. No new variable is required for normal hosting.

## Ask Google to discover the sites

1. Add `azuriasmp.org` as a Domain property in Google Search Console and verify
   its ownership using the DNS TXT record Google supplies. This covers the
   www and launcher subdomains.
2. Alternatively, create URL-prefix properties for each production URL. Choose
   HTML tag verification, copy only its `content` token, and put it in the
   corresponding Vercel project's `AZURIA_GOOGLE_SITE_VERIFICATION` variable.
   It is a public verification value, not a password. Redeploy, then verify.
3. Submit both sitemaps:

   - `https://www.azuriasmp.org/sitemap.xml`
   - `https://launcher.azuriasmp.org/sitemap.xml`

4. Use URL Inspection for each homepage, test the live URL and request indexing.
   Review Page indexing reports for errors, redirects or unexpected noindex tags.

These steps do not guarantee indexing, ranking or a particular snippet. Google
may choose a different title or description and needs to recrawl after updates.
The sitemap lists the built public routes. Individual news stories currently
load through the news page in JavaScript; this update does not generate separate
static article routes or claim article-rich-result support.

Google references:

- https://developers.google.com/search/docs/fundamentals/get-started-developers
- https://developers.google.com/search/docs/appearance/title-link
- https://support.google.com/webmasters/answer/9008080

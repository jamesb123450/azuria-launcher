# Azuria CurseForge service

This Worker is maintained in the private `azuria-launcher` source repository. It forwards a bounded set of catalogue and bulk metadata requests to the fixed CurseForge API origin. Verified game/content archives still download directly from approved CDN hosts. It respects provider download restrictions; it does not mirror or bypass restricted files.

The CurseForge key must be an **Actions secret**, never a committed file, public repository value, `VITE_` environment variable or desktop build setting. A private source repository does not protect secrets embedded in public installers.

## Deploy from the private repo

1. In Cloudflare, create a Workers account and note its Account ID. Create an API token with **Account → Workers Scripts → Edit**, scoped to that account. If the account has not enabled a `workers.dev` subdomain yet, enable it in **Workers & Pages** first.
2. In **jamesb123450/azuria-launcher → Settings → Secrets and variables → Actions → Secrets**, add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and your approved `CURSEFORGE_API_KEY`. Do not add them to `azuria-releases` or paste their values into issues or PRs.
3. After merging, open **Actions → Deploy private CurseForge service → Run workflow** on `main`. The manual workflow deploys the Worker, then copies the private repository key to an encrypted Worker secret. No key is included in app builds, bundles, website output or public releases. Initial requests return an unavailable response until the secret has been uploaded.
4. Copy the deployed Worker URL from the deployment output. In the source repository’s **Actions → Variables**, add `AZURIA_CURSEFORGE_PROXY_URL` with the full URL ending in `/v1`, for example `https://azuria-curseforge.YOUR-SUBDOMAIN.workers.dev/v1`. This URL is public and can be an ordinary variable. Only HTTPS `workers.dev` URLs ending in `/v1` are accepted by this version of the launcher.
5. Build a new Windows release with that variable. Older installers keep their previous behaviour; this change removes legacy client-side CurseForge credentials on startup. Builds without a service URL continue to support Modrinth and explain CurseForge unavailability.

To rotate the key, update `CURSEFORGE_API_KEY` in the private repo and run this deployment workflow again. Existing configured launchers do not need a new release for a key rotation. For local deployment, use `npx wrangler@4 deploy` and `npx wrangler@4 secret put CURSEFORGE_API_KEY` from this directory. `.dev.vars` and `.env` files must never be committed.

## Limits and privacy

GET routes are limited to categories, search, projects and files. POST is limited to `mods` and `mods/files` with at most 1,000 numeric IDs and a 64 KiB body. Responses are limited to 16 MiB; redirects, upstream error details and upstream headers are not forwarded. The service receives search terms, content IDs and normal request metadata. It receives no Microsoft tokens, game logs or account identifiers.

The service is public: a desktop app cannot safely store a shared proxy password. A rate-limit binding allows 120 calls per minute per Cloudflare client address and location; shared networks share this allowance. Cloudflare account request quotas still apply, so monitor usage in the Cloudflare dashboard. Worker observability is disabled by default and request bodies/keys are never explicitly logged. Cloudflare and CurseForge still process normal service traffic under their policies. Choose an unused rate-limit namespace ID if `18432001` is already used in your Cloudflare account.

This service is prepared but cannot operate until the account secrets and public URL are configured. Its separate manual workflow never changes launcher releases or publishes repository source.

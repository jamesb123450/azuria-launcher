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

All fonts and images are served locally. No analytics, ads, embeds or third-party scripts are loaded. The first-visit banner offers equally prominent Accept optional and Reject optional actions. Neither action enables tracking; there are currently no optional trackers. The versioned local-storage consent record expires after 180 days. Cookie settings reopens it on every page. Requested theme preferences are stored separately. Blocked storage does not break navigation or the banner.

If adding optional tracking, implement an actual consent gate before loading it, bump the consent-key version, update the policy and test both choices. Do not enable analytics through the hosting dashboard without reviewing this behaviour. The website policy does not replace individual project policies.

The privacy contact links to the existing launcher contact page. Update it when a dedicated studio contact channel is available. Review policy details whenever data collection or hosting changes.

## Assets

Azuria brand assets and launcher screenshot are included locally. Inter is distributed under the included `assets/INTER-LICENSE.txt`. The launcher screenshot contains Minecraft scenery from Karbin_Drem's Distant Shaded Panoramas, licensed CC BY-SA 4.0: https://modrinth.com/resourcepack/karbin-panoramas and https://creativecommons.org/licenses/by-sa/4.0/. The screenshot shows the Azuria interface over that scenery. Minecraft is a trademark of Mojang/Microsoft; this site is not affiliated with them.

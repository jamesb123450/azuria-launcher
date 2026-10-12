# Launcher visual redesign

## Reference study (2026-10-12)

The actual desktop launcher interfaces, rather than only their marketing pages, informed this revision:

- Lunar Client: https://www.lunarclient.com/news/how-to-use-the-new-lunar-client-launcher — strong launch hierarchy, slim navigation, large game artwork, consistent compact controls.
- Current Lunar screenshot: https://raw.githubusercontent.com/flathub/com.lunarclient.LunarClient/master/screenshots/launcher.png
- Modrinth Play page: https://modrinth.com/news/article/app-personalization/ — a combined play/library workspace, fast instance selection, compact instance cards and a useful contextual pane.
- Dawn: https://dawn.gg/ — narrow navigation rail, a large personalised world banner and concise profile controls. Reference screenshot: https://dawn.gg/img/modernui/home-modern-v6-1280.webp

## Modrinth-focused refinement (2026-10-12)

The current official 2026 screenshots were inspected directly:

- Play/library: https://cdn.modrinth.com/app-landing/home-2026.webp
- Instance/content: https://cdn.modrinth.com/app-landing/instance-2026.webp
- Design explanation: https://modrinth.com/news/article/app-personalization/

Observed patterns: a combined Play/library page, immediately legible instance identity,
large icon surfaces, compact search and filters, consistent rounded controls, and a
separate contextual pane. Azuria applies those layout principles using its own
blue and pink identity, original assets and implementation.

## Azuria direction

A compact selected-instance spotlight replaces the oversized scenic banner. Larger
library tiles use stable colours derived from each instance ID, so the same icon and
colour appear in the navigation rail, library, details pane and launch dock. Cards
expose favourite, edit, copy-settings and delete actions. The right pane contains
truthful account status, selected-instance details (or first-use onboarding) and an
upcoming discovery link. No friends, installed content or play history is invented.

Neutral charcoal surfaces, restrained blue/pink gradients, clearer typography,
rounded controls and softer borders carry across Settings, updates and dialogs.
The shared CSS is rebuilt rather than patched with accumulated overrides. The
integrated native titlebar and fixed Play dock remain. At short desktop heights,
headings and artwork compact so the first instance row stays above the dock; the
context pane collapses below 1100 pixels. Dark, light and system themes remain.

SQLite data, Rust commands, updater trust keys, sign-in scope and actual launch
behavior are unchanged. Sign-in and Minecraft launch are still pending.

## Assets and provenance

`public/artwork/overworld.webp` is original launcher artwork created with the built-in image-generation tool. It is a conceptual voxel world, not an in-game screenshot, and does not depict an installed user world. No competitor screenshot, branding or promotional artwork is shipped. The reference screenshots were studied only.

Final artwork prompt: “An original in-game screenshot-like panoramic voxel world with authentic small square grass blocks, a wide winding river, densely wooded pine valley, tall block-built mountains on the right, distant pale snow peaks, and pink cherry trees beside the water. Cinematic early morning golden sunlight from the upper right, cool blue atmospheric mist, natural water reflections and detailed voxel foliage. Wide approximately 21:9 composition with horizon in the upper third and a darker lower-left riverbank for interface text. Restrained natural pink/blue accents. No characters, buildings, text, logos, UI or watermark.”

Instance cube icons and the Azuria mark are original code-native SVG geometry. Inter’s OFL licence is preserved in `docs/FONT-LICENSE.txt`; the bundled Latin font avoids runtime font-service requests.

## Verification

Production build and TypeScript checking; existing instance-lifecycle and theme/focus tests; additional layout and selection checks; screenshots of empty/populated libraries, dark/light themes, settings, dialogs and the minimum desktop size. Windows CI builds an updated NSIS development installer. A browser screenshot with seeded fixture instances is a design preview only; the actual app still starts with the user's persisted library.

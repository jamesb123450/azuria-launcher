# Launcher visual redesign

## Reference study (2026-10-12)

The actual desktop launcher interfaces, rather than only their marketing pages, informed this revision:

- Lunar Client: https://www.lunarclient.com/news/how-to-use-the-new-lunar-client-launcher — strong launch hierarchy, slim navigation, large game artwork, consistent compact controls.
- Current Lunar screenshot: https://raw.githubusercontent.com/flathub/com.lunarclient.LunarClient/master/screenshots/launcher.png
- Modrinth Play page: https://modrinth.com/news/article/app-personalization/ — a combined play/library workspace, fast instance selection, compact instance cards and a useful contextual pane.
- Dawn: https://dawn.gg/ — narrow navigation rail, a large personalised world banner and concise profile controls. Reference screenshot: https://dawn.gg/img/modernui/home-modern-v6-1280.webp

## Azuria direction

A desktop workspace with neutral charcoal surfaces, crisp locally bundled Inter typography, restrained blue actions and pink brand accents. An integrated draggable desktop titlebar includes working minimize/maximize/close controls. A slim navigation rail replaces the wide marketing sidebar. The main content combines a scenic world banner and compact searchable library. A contextual pane exposes selected-instance settings and truthful setup progress. A fixed bottom launch bar anchors the primary action. Grid/list controls, keyboard focus, modal operation and light/system themes remain supported. The context pane collapses at the minimum desktop width.

The layout is rebuilt rather than layered over the old styles. Existing SQLite data, Rust commands and authentication scope are unchanged. No friends, live players, installed content or account state are fabricated. Play still explains the current milestone boundary.

## Assets and provenance

`public/artwork/overworld.webp` is original launcher artwork created with the built-in image-generation tool. It is a conceptual voxel world, not an in-game screenshot, and does not depict an installed user world. No competitor screenshot, branding or promotional artwork is shipped. The reference screenshots were studied only.

Final artwork prompt: “An original in-game screenshot-like panoramic voxel world with authentic small square grass blocks, a wide winding river, densely wooded pine valley, tall block-built mountains on the right, distant pale snow peaks, and pink cherry trees beside the water. Cinematic early morning golden sunlight from the upper right, cool blue atmospheric mist, natural water reflections and detailed voxel foliage. Wide approximately 21:9 composition with horizon in the upper third and a darker lower-left riverbank for interface text. Restrained natural pink/blue accents. No characters, buildings, text, logos, UI or watermark.”

Instance cube icons and the Azuria mark are original code-native SVG geometry. Inter’s OFL licence is preserved in `docs/FONT-LICENSE.txt`; the bundled Latin font avoids runtime font-service requests.

## Verification

Production build and TypeScript checking; existing instance-lifecycle and theme/focus tests; additional layout and selection checks; screenshots of empty/populated libraries, dark/light themes, settings, dialogs and the minimum desktop size. Windows CI builds an updated NSIS development installer. A browser screenshot with seeded fixture instances is a design preview only; the actual app still starts with the user's persisted library.

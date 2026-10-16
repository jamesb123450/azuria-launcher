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

## Supplied screenshot layout (2026-10-12)

The user's screenshot clarified the desired composition: a full-width titlebar,
compact Jump in rows in two columns, a wide library search/actions row,
collapsible library groups, icon tiles, and a continuous right-hand pane. This
revision follows that structure directly and removes the scenic home banner
and fixed bottom Play dock.

Azuria retains blue primary actions, pink favourites/account accents, original
cube artwork and its own wordmark. The sidebar remains narrow, while the
account/onboarding/development pane scrolls independently from the library.
Search, sorting, grid/list mode, selection, favourites, copying settings,
editing and deletion retain their existing behavior. Play buttons sit beside
instances and explain the current launch milestone.

Library groups are functional derived sections by loader or favourite state;
they can be collapsed. No custom-group storage, player counts, play history,
Modrinth account state or news feed is fabricated. Dates are explicitly labelled
as creation dates. The screenshot's competitor branding, mod icons, personal
account information and promotional assets are not shipped.

Dark/light themes, native titlebar controls and updater trust remain supported.
Screenshots in docs/previews use example browser-preview instances, not the
user's real desktop library. Microsoft sign-in and game launch remain pending.

## Assets and provenance

`public/artwork/overworld.webp` is original launcher artwork created with the built-in image-generation tool. It is a conceptual voxel world, not an in-game screenshot, and does not depict an installed user world. No competitor screenshot, branding or promotional artwork is shipped. The reference screenshots were studied only.

Final artwork prompt: “An original in-game screenshot-like panoramic voxel world with authentic small square grass blocks, a wide winding river, densely wooded pine valley, tall block-built mountains on the right, distant pale snow peaks, and pink cherry trees beside the water. Cinematic early morning golden sunlight from the upper right, cool blue atmospheric mist, natural water reflections and detailed voxel foliage. Wide approximately 21:9 composition with horizon in the upper third and a darker lower-left riverbank for interface text. Restrained natural pink/blue accents. No characters, buildings, text, logos, UI or watermark.”

Instance cube icons use original code-native geometry. The application icon and header mark use the project owner’s supplied `AzuriaPinkA.png` artwork. Tauri’s icon generator fits the image onto a square transparent canvas without cropping or stretching, then produces the Windows ICO/PNG assets and browser branding sizes. Inter’s OFL licence is preserved in `docs/FONT-LICENSE.txt`; the bundled Latin font avoids runtime font-service requests.

## Verification

Production build and TypeScript checking; existing instance-lifecycle and theme/focus tests; additional layout and selection checks; screenshots of empty/populated libraries, dark/light themes, settings, dialogs and the minimum desktop size. Windows CI builds an updated NSIS development installer. A browser screenshot with seeded fixture instances is a design preview only; the actual app still starts with the user's persisted library.

## Discover catalogue preview

The user-supplied discovery reference informed the category tabs, search and sorting controls, compact project rows, tags and right-aligned install/metadata area. Azuria retains its pink/blue palette and adds a separate right-hand filter panel, original CSS gradient icons, theme-aware surfaces and a quieter layout. No provider logos or project artwork were copied.

`src/lib/discover.ts` contains fictional catalogue fixtures, explicitly identified in the UI. Search, filters, sort order and pagination operate locally; disabled install buttons do not download files or imply a working integration. The four content types are modpacks, mods, datapacks and resource packs. Discover has its own `/discover` route; the help button still opens the development roadmap.

## Interface polish

This pass preserves the shell, navigation, instance layouts, right-hand Discover filters and pink/blue identity. It standardizes library dropdowns on the existing themed picker, reduces floating card effects, aligns card corner treatments, increases supporting-text readability and improves keyboard access with a skip link. Empty states and development notices use direct wording rather than promotional slogans. The empty library has one clear empty state instead of a second empty recent-instance panel. Success notices dismiss after five seconds or navigation; errors stay visible. Settings actions wrap when space is limited, account progress has a distinct treatment and update errors use the shared error style.

Design rationale draws on Jakob Nielsen’s [usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): consistency, visible status, contextual help and less competing information. Comparable workflows were reviewed in [Prism’s instance creation/editing guide](https://www.prismlauncher.org/wiki/getting-started/create-instance/) and [Modrinth’s app overview](https://modrinth.com/app/), alongside the user’s supplied app references. The patterns inform task clarity and familiar controls; no launcher branding, assets or layout redesign is introduced. This is a heuristic review, not a claim of completed user testing or accessibility certification.

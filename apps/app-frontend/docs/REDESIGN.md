# Azuria launcher redesign

Home focuses on launching Minecraft. Versions contains the live Mojang catalogue
and a secondary Saved setups tab. Existing custom setups, worlds, account storage,
installation checks, content permissions and update signing keep their existing paths.

The visual reference is the approved Azuria desktop concept. Lunar's compact
navigation rail, integrated launch selection and contextual right column informed
the layout (https://www.lunarclient.com/news/how-to-use-the-new-lunar-client-launcher).
The app uses its existing Azuria icon, bundled fonts and a real licensed Minecraft
capture. No generated artwork or fabricated news is included.

## Visual system

| Token        | Default   | Role                          |
| ------------ | --------- | ----------------------------- |
| Background   | `#0b0d12` | Window and main surface       |
| Panel        | `#151923` | Account and content surfaces  |
| Raised panel | `#1d2230` | Controls and selected options |
| Text         | `#f3f3fa` | Main text                     |
| Muted        | `#b6bfd3` | Supporting text               |
| Pink         | `#e6b0e5` | Selection and Azuria accent   |

Inter carries the interface. The vivid launch control is the main visual accent;
other controls stay quiet. Dark, light, OLED and system appearance remain supported.
Theme transitions and loading skeletons respect the system reduced-motion setting.
`src/redesign.css` owns the shell and Home/Versions styles; existing screen styles
own their local layouts. Avoid adding another global override layer.

## Home launching

`stores/quick-play.ts` stores the chosen version/loader and an ID mapping in local
app webview storage (`azuria-quick-play-v1`). Home only reuses setups it created;
it never matches an arbitrary custom setup by name or version. Missing or edited
setups receive a new isolated setup on the next launch. Clearing webview storage
resets this mapping; existing setups and worlds remain in Saved setups.

New setups use global memory defaults and pin Fabric's stable loader for the
selected Minecraft version. Concurrent requests share one creation operation.
The native `create_instance` command accepts optional `prepare: false` for Home:
it creates the setup without starting background preparation, then Home calls
`launch_instance` once. Omitted/true retains the existing download-after-creation
behaviour for custom setup creation. Account verification and game status must be
ready before Home creates anything. Browser preview never creates or launches a
setup through the Home launch button.

The news section shows published Azuria stories from the shared account service, with loading, empty and retry states. Artwork credits are available
under the hero and in `public/scenery/CREDITS.md`; provider asset sources live in
`public/providers/CREDITS.md`.

## Versions and appearance refinements

The Versions catalogue groups release patches into portrait cards (1.x by minor version, 26+ by year). Mojang catalogue order is preserved; snapshots and historical builds stay separate. Selecting a card updates the right context panel without navigating away. The patch selector and Vanilla/Fabric controls feed the existing quick-play store. The compact launch control reuses Home's account checks, automatic setup mapping, launch progress and cancellation paths. Unsupported loaders are not presented as available. Saved setups remains a separate tab.

Version art is local, with sources in `public/version-art/README.md`. Release illustrations and screenshots come from Mojang's official launcher feed; unmapped versions use clearly generic existing Minecraft scenery. The sidebar uses Play for Home, removes Development, and puts its separator above Saved setups and Settings.

Appearance selection temporarily overrides the rendered theme without changing persisted settings. Save commits through the existing settings API; Reset restores the last saved choice. Discard and unmount remove the preview. System-theme changes also respect the active preview. Other settings continue to require Save. The footer version area has a subtle dark gradient; scrollbars and Home scenery blur share the app theme.

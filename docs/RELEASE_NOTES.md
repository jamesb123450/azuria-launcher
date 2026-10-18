# Branded Windows setup and privacy acknowledgement

- Add Azuria artwork, installer icons and clearer native welcome/finish pages to Windows setup.
- Include an offline privacy policy with an unchecked mandatory acceptance box before installation can continue.
- Record the accepted policy fingerprint locally only after successful installation. Require acknowledgement for new policies, including updates; reject silent installation without prior matching acceptance.
- Preserve signed update packaging and upstream installation/uninstallation handling, with native Windows acceptance checks in CI.

# Settings, privacy and desktop behaviour

- Add functional privacy preferences, OLED appearance, a pinned version footer and readable settings rows. Save and Reset appear only for pending edits in a floating action bar.
- Detect physical RAM for Minecraft allocation, including systems above 64 GiB. Limit concurrent asset downloads to a 1–10 slider, preserving older preferences with a reduced cap.
- Show running instance names with Stop and Open logs actions, and display a startup loading screen while the library opens.
- Keep the Windows launcher in the system tray when the window closes, retaining live game monitoring and safe explicit quitting.
- Display measured storage in a segmented bar with a compact horizontal legend.
- Move CurseForge API credentials out of app settings into a private, publisher-deployed Cloudflare Worker. Deployment and repository-secret setup are required before CurseForge is available in new builds.

# Behaviour settings and Discord activity

- Enable saved Behaviour preferences for minimising after Minecraft starts, refocusing after the last game closes, hiding the right sidebar and compact library defaults, with Save and Reset.
- Add optional Windows Discord Rich Presence showing generic Playing Minecraft activity only while the game runs. Clear activity on exit or opt-out; missing Discord never blocks launching.
- Document the public Discord Application ID build setting and disclose the limited activity data shared with Discord.

# Consistent text fields

- Theme text, password, numeric and multiline fields consistently across launcher popups, including storage preferences, provider keys and content installation.
- Align Java and window settings with the shared field styling, with readable placeholders, disabled and read-only states, themed autofill and visible keyboard focus.
- Preserve icon-led search layouts and give log search a clearer themed input frame.

# Storage resources

- Add real background storage measurements with per-instance categories, shared game files, runtimes, logs, screenshots, skins and trash. Hard-linked files are counted once.
- Preview and confirm cleanup of abandoned staging downloads older than 24 hours, with stale-file checks and protection while Minecraft or content downloads are active.
- Save or reset unused-download retention and Minecraft asset download concurrency in Settings → Storage. The retention limit applies when cleanup is run; worlds, installed content, shared files, runtimes and trash are kept.
- Open the actual Azuria app directory directly from Storage settings.

# Instance log console

- Refine instance logs with a compact toolbar, search, severity filters and readable coloured output.
- Add copy and export for visible lines, display-only clearing, wrapping and auto-scroll that pauses while reading older output.
- Keep live polling and credential filtering, with accessible controls and light-theme colours.

# Public release distribution

- Move signed updates, downloads and the public website to azuria-releases so source access can be restricted without requiring users to authenticate.
- Preserve release numbering, updater signatures and a temporary bridge for existing installations.

## Changes

- Kept additional content directly on the instance page with All/Mods/Resource packs filters, sorting, uploads, Discover browsing, selection actions and a compact project/version/actions table.
- View content now opens a centred, searchable pack-content popup instead of replacing the additional-content list.
- Added a version switcher with compatible provider version names, dates, Release/Beta/Alpha badges and on-demand changelogs. Selecting a version prepares a reviewed update or repair; no files change just by browsing versions.
- Simplified instance and content actions with icon buttons, accessible names/tooltips and overflow menus.
- Added an explicitly enabled website-only AdSense snippet slot at website/src/adsense.html, plus publisher setup and private-key storage instructions. Advertising remains off by default and is not loaded by the Windows launcher.

- Added real project artwork and dedicated Description, Versions and Gallery pages using provider metadata, with sanitised rich descriptions and shared installation review.
- Instance content shows recognised project icons and names. Modpack instances separate pack-managed files from additional content and show the installed pack version.
- Added compatible stable update checks and missing-pack-file repair. Updates stage verified files, preserve edited configuration, worlds and added content, and back up replaced files. Interrupted publication restores backups; modified archives stop with a conflict.
- Added batch Modrinth hash identification for local imports and pack files, plus provider metadata for managed CurseForge content. Vanilla instances no longer display or open a Mods section.
- Refined install notifications with a compact, single-line Cancel install action.

- Connected Discover to live Modrinth and CurseForge search for mods, modpacks, datapacks and resource packs, retaining the right-hand filter sidebar.
- Added compatible version selection, a review step, required dependencies, cancellable downloads, hash verification and recovery of interrupted content installs. Different existing files are preserved on conflict.
- Modpacks create new Vanilla/Fabric instances and prepare game files without launching Minecraft. Datapacks install into a selected existing world. Unsupported loaders, external Modrinth pack hosts and restricted provider downloads report clear errors.
- Added CurseForge API key setup under Settings → Content providers with shared Save/Reset controls and native Windows Credential Manager storage. Approved CurseForge API access is required; Modrinth needs no key.

- Fixed Fabric Stable/Latest selections being sent as literal version strings. New instances save concrete versions; existing preferences resolve and pin on the next preparation attempt.
- Added support for Minecraft 26.1 Fabric profiles, which no longer include intermediary mappings. Older Minecraft profiles retain mapping validation.
- Creating a Vanilla or Fabric instance now downloads and verifies the required game files, libraries, assets and Java without opening Minecraft or requiring sign-in. Play reuses those files and verifies the account only before starting the game.
- Added download progress, Stop, Resume/Retry download and a ready state. Failed or cancelled downloads retain the instance and verified cache for retry.

- Added Windows Fabric launching using the selected Minecraft and pinned Fabric loader version. Quilt, Forge and NeoForge remain coming soon.
- Fabric preparation merges official loader libraries and arguments with Mojang game metadata, verifies library checksums, and caches profiles by version pair. Existing Java/memory overrides, account verification, live logs and Play/Stop controls are reused.
- Cancelling preparation preserves verified downloads for retry. Changing the loader version prepares a separate profile without removing instance content. Fabric API and mods are installed separately.

- Replaced the settings page with a centred, category-based popup that keeps your current screen behind it.
- Added a fixed Save/Reset footer, shared pending edits across categories, validation and an unsaved-change prompt. Reset restores the last saved values.
- Reorganised appearance, account, Java/memory, window, storage and update settings. Planned features are clearly labelled Coming soon.

- Rebuilt the skin selector around a large rotatable character preview and saved-skin cards, retaining Azuria’s current colours and interface.
- Added local skin saving, PNG picking and drag-and-drop, hover/keyboard Edit and Remove actions, and an editor with Classic/Slim arms and owned cape selection.
- Saved skins remain under `%APPDATA%\AzuriaLauncher\skins`, with bounded storage and a recovery backup. Saving locally and applying to the Minecraft account are separate actions.
- Skin/cape application refreshes account appearance after partial service failures and reports what needs retrying.

- Matched the instance Screenshots link to the other section controls, including its camera icon.
- Fixed sidebar selection so Library and individual instances highlight only on their own pages.
- Added a square advertisement placeholder anchored within the bottom-right Library sidebar. It contains no advertising scripts or network requests.
- Replaced cape texture sheets with angled previews of the actual cape faces and edges.

- Added a Minecraft skin and cape manager: preview your skin, upload Classic/Slim PNGs, reset it, and equip or hide owned capes.
- Show the signed-in player’s skin head in the account sidebar and navigation.
- Added a screenshot gallery with instance filtering, full previews, PNG export, folder access and recoverable removal to Azuria’s trash.
- Instance Logs refresh every second, with log selection, pause and follow-output controls.
- Play becomes Stop as soon as preparation starts. Stop cancels preparation or terminates the owned Minecraft process; stopping a running game warns about unsaved changes.
- Simplified launch feedback while retaining actionable errors and crash details.

No storage migration is required. Cosmetics require a verified Minecraft Java account and Minecraft Services access. Skin/cape changes and real gameplay must be checked with an owned account on Windows; automated interface tests use mocked native responses.

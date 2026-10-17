## Changes

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

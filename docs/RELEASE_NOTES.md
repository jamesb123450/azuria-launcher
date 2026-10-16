## Changes

- Fixed the migration dialog appearing at every startup. Azuria now checks the saved migration state before showing it; completed and acknowledged migrations start normally without a migration-screen flash. Real migrations and retryable errors retain their acknowledgement flow.
- Updates are checked and downloaded automatically on every startup. Signed packages must verify before installation. A visible 15-second restart countdown installs the update automatically; **Later** postpones the restart, with **Restart & install** available in Settings.
- Replaced the manual update-check box with a redesigned update panel: version transition, real download progress and byte counts, signature stage, release notes, restart action and retry feedback. Failed downloads or verification never run the installer.
- Moved instance General, Installation and Overrides settings into a scrollable popup with keyboard focus containment, Escape/close handling and unsaved-change protection. The instance overview remains its own page. Old settings links open the popup for compatibility.
- Added an icon studio with nine symbols, twelve colours and four background finishes, live previews, image upload, reset and randomisation. Instance creation also offers the expanded symbols and palettes.

## Update information

Windows must close Azuria to run its installer. The restart countdown makes that transition visible and can be postponed. Minecraft installation and launching remain unavailable. Storage locations and the schema 5 database are unchanged.

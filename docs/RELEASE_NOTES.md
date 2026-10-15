## Changes

- Replaced native version dropdowns with themed, scrollable menus using Azuria’s blue selection highlight.
- Added Show all versions controls for snapshots and loader pre-releases.
- Other now lists available loader versions instead of requiring manual entry.
- Loader lists refresh for the selected Minecraft version, with retry controls when a provider is unavailable.
- Added keyboard navigation and Escape dismissal for version menus.
- Removed memory allocation from Create/Edit instance. Existing allocations are preserved; new instances keep the default.
- Fixed initial-load dialog styling for consistent width, icon size and close-button appearance.

## Update information

Install through Settings → Update & restart. This update uses the existing schema 3 database and does not require a new migration.

This is a development release. Loader settings remain saved preferences; Microsoft sign-in, game installation and Minecraft launching are not implemented yet.

## Changes

- Added the first Vanilla Minecraft launch flow for Windows x64. Play is available from the Library and instance page; modded loaders remain unavailable.
- Prepare official Mojang version metadata, client files, libraries, Windows natives, asset indexes, game assets and logging configuration. Downloads are hash-checked, reused when valid and retryable after interruption. Asset downloads use a bounded worker pool.
- Automatically prepare the Java runtime specified by Mojang, or validate a custom Java executable against the game’s required major version.
- Apply launcher defaults and instance overrides for memory, JVM arguments, environment variables, resolution and fullscreen. Game files remain in the instance’s named folder; shared downloads and managed Java live in `game-cache` under AzuriaLauncher’s AppData folder.
- Refresh Minecraft credentials natively before preparation and again before starting Java. Account tokens are never returned to the interface or launch-status events. Minecraft Java ownership and valid Minecraft Services access remain required.
- Show real preparation progress, cancellation, running state, normal exits and crash feedback. Capture bounded, redacted launcher output in the instance Logs section.
- Block duplicate preparation/launches and protect active instance folders from renaming or removal. Keep Azuria open while games are active, and postpone updater installation until games and preparation have finished.

## Testing and availability

Minecraft Services approval remains an external dependency for authenticated end-to-end testing. This initial implementation does not provide offline, demo, Fabric or other mod loader launching. Windows x64 gameplay and graphics-driver compatibility need validation on a real Minecraft-owned account before treating this as a stable launcher release.

No storage migration or database schema change is required. Existing worlds and user content are retained. First launch requires an internet connection and enough disk space for Java, game files and assets.

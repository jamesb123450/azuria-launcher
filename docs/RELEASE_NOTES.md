## Changes

- Interrupted instance removals now recover automatically on startup.
- Removed instance files stay in trash, with settings and recovery metadata retained.
- Storage conflicts show recovery instructions without overwriting either folder.
- Storage errors can be retried without restarting the launcher.
- Failed favourites, appearance changes, and browser actions no longer block instance creation.
- Failed saves retain form input, and appearance-loading failures no longer hide a successfully loaded library.
- Updated the public README and added a storage recovery guide.

## Update information

Install through Settings → Update & restart. This update migrates the local database to schema 2; older launcher builds cannot open the migrated database. Close Azuria and back up the application data directory before upgrading if you need the option to return to an older build.

This is a development release. Microsoft sign-in, Minecraft installation, and game launching are not implemented yet.

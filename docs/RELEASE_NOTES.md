## Changes

- Moved Windows launcher data to `%APPDATA%\AzuriaLauncher`, with active instance folders inside `instances`.
- Instance folders now use instance names instead of UUIDs. Windows-incompatible characters and reserved names are handled safely, and duplicate names receive numbered suffixes.
- New instances create their folders immediately. Renaming an instance updates its folder with a recovery journal to protect against interruption.
- Added a first-launch migration screen that copies and verifies existing settings, instances and trash while retaining the original location as a backup.
- Migration requires **Confirm and open instances** before the launcher can be used. Escape, backdrop clicks and normal window-close requests cannot bypass acknowledgement. Confirmation opens the instances folder in File Explorer; if opening fails, the message remains available to retry.
- Added **Open instances folder** to Settings → Storage & privacy.

## Update information

Allow extra time and free disk space for the verified copy on the first launch after updating. Keep the original data until you have checked the migrated library. A failed migration is retryable without discarding the original data. A completed migration awaiting acknowledgement reappears after restarting; later launches proceed normally after confirmation.

The instance database migrates to schema 4. Older builds cannot open the migrated database; retain the original-location backup if you need to revert. Account credentials remain in Windows Credential Manager.

This update changes storage only. Minecraft installation and launching remain in development, and Minecraft Services application access is still pending review.

# Storage recovery

## Location and backups

Azuria uses Tauri's local application data directory for `com.azuria.launcher`, normally under Local AppData on Windows. It contains:

- `azuria.sqlite3`: instance settings, appearance and deletion records.
- `instances/<UUID>/`: active instance files.
- `trash/<UUID>-<operation UUID>/`: removed instance files.
- `storage.lock`: an operating-system lock held while storage is open.

Close every Azuria window before copying or changing these files. Back up the whole directory, including any SQLite WAL files. Do not delete the lock file: the operating system releases the lock when the process exits.

Only one process can open the storage at a time. If another window holds the lock, close it and use Retry in the library.

## Interrupted removal

Removal first commits a pending record with the instance settings, trash destination and whether files existed. It then moves the folder and atomically deletes the instance record and marks the removal complete.

After interruption, pending operations are reversed:

- Original folder exists, trash folder does not: retain the original instance.
- Trash folder exists, original folder does not: move it back.
- Both exist: stop and report both paths without overwriting either.
- Neither exists, but files existed before removal: stop and report the missing paths.
- Neither exists and the instance already had no folder: retain its settings.

Startup recovery is retryable from the library. Native initialization does not close the app on storage errors.

If recovery reports a conflict, close Azuria and back up all data first. Compare both folders and preserve any unique files. Move the conflicting original folder to a separate backup location so recovery can restore the trash folder, then reopen Azuria and retry. If files are missing, restore the appropriate folder from backup. Do not remove database records to suppress a recovery error.

## Completed removal

Completed removals stay removed after restart. Their files remain in trash, and the `deletions` table retains `instance_json`, `trash_name` and `completed=1`. No automatic trash cleanup is performed.

There is no automatic restore command yet. To recover files without editing SQLite, create a new instance with the original settings, close Azuria, and copy the old files into the new instance's UUID directory. Keep the original trash folder until the recovered instance has been checked. A full backup can instead restore the database and folders together.

## Schema compatibility

This change migrates schema 1 to schema 2 without changing existing instances. Older builds reject schema 2; use the updated launcher to open it. Restoring an older application version requires its matching pre-migration data backup.

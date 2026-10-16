## Changes

- Open an instance from its Library card or sidebar shortcut to reach its own page, with Content, Worlds and Logs sections in Azuria’s existing theme.
- Added General, Installation and Overrides settings. Rename instances and their folders, customise icons, edit version preferences, duplicate settings or all local files, and remove instances with files retained in local trash.
- Added game defaults in launcher Settings for memory, Java executable, JVM arguments, environment variables and window resolution/fullscreen. Instances inherit defaults unless a custom override is enabled. Existing memory preferences are preserved on upgrade.
- Added local `.jar` mod and `.zip` pack imports, enable/disable controls and recoverable file removal. Existing world folders can be opened and game logs viewed with a bounded preview and common credential lines hidden.
- Added Java detection through JAVA_HOME/PATH and an executable file picker on Windows. No Java process is started by these controls.
- Added save feedback, validation, unsaved-change prompts, missing-instance recovery and empty states. Browser previews clearly distinguish desktop-only file actions.

## Update information

The database upgrades to schema 5. Keep a backup before reverting to older builds, which cannot open this schema. Files remain under `%APPDATA%\AzuriaLauncher\instances\<instance name>`.

The storage migration acknowledgement remains required. **Open instances folder** is optional and separate from **Confirm and continue**.

Game preferences are saved for future use. Minecraft downloading, installation, repair and launching remain unavailable. Minecraft Services application access is still pending review.

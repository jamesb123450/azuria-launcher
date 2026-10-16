# Architecture

## Boundaries

- `src/views` and `src/components`: Vue UI only.
- `src/stores/launcher.ts`: Pinia UI state, serialized operations, visible errors.
- `src/api.ts`: typed Tauri commands; explicitly separate browser preview adapter.
- `crates/azuria-core/src/lib.rs`: framework-independent SQLite and instance operations.
- `src-tauri/src/lib.rs`: thin Tauri commands and platform data-path selection.
- `crates/azuria-auth`: native Microsoft PKCE, Xbox/Minecraft verification and Windows credential storage.
- `src/auth.ts` and `src/stores/account.ts`: token-free account commands and UI state.

The Rust core owns desktop persistence. UI input is revalidated in Rust. An OS-neutral PathBuf plus Tauri data-directory resolution avoids hardcoded Windows paths. Future credential/process/runtime modules must isolate platform-specific operations; provider adapters must not depend on Vue.

## Data and invariants

Schema version 1 uses `PRAGMA user_version`; newer schemas are rejected rather than overwritten. SQLite WAL and a busy timeout are enabled. A mutex serializes commands. UUIDs are validated and canonicalized before filesystem operations; user names are display-only. Creation allocates an empty directory and rolls it back if database insertion fails. Removal renames to trash and restores the directory if database deletion fails.

Filesystem and SQLite operations are not one atomic transaction. A process/power failure between them can leave an orphan directory or a database entry whose directory has been moved. Files are retained; crash reconciliation/journaling is required before game installation adds substantial instance content. No crash-atomicity claim is made for this foundation.

## Permissions and future security

Only the local main webview receives core permissions and the four window-management permissions needed for its integrated draggable titlebar (minimize, toggle maximize, close and start dragging). No shell/filesystem plugins, remote webviews, account tokens or unrestricted process commands are exposed. A single Rust command opens the fixed GitHub project URL through the platform URL handler; it accepts no caller-provided command, arguments or URL. CSP prevents remote scripts/frames. Authentication runs in Rust and exposes fixed progress stages and token-free account views. Refresh credentials use Windows Credential Manager; Microsoft, Xbox and Minecraft access tokens remain in native memory. A generation guard prevents cancelled work from committing an account. An interactive account switch is saved only after Java entitlement/profile verification and secure persistence succeed. Future downloads must preserve these boundaries. Future remote project descriptions must be sanitized before display; credentials/launch arguments must be redacted from logs.

Theme is persisted by Rust and follows OS preference in system mode. Browser preview uses a versioned storage key and contains no game-launch capability. No fake installed instances are seeded.

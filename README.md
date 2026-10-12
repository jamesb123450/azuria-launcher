# Azuria Launcher

A Windows-first Minecraft Java launcher built with Vue 3, TypeScript, Tauri 2 and Rust. Pink and blue accents, a clear instance library, and dark/light/system themes.

## Current milestone: foundation

Working: instance creation, editing, copying **settings only**, favourites, search/filter/sort, recoverable removal, and saved appearance. The desktop uses a Rust-managed SQLite database and UUID-named instance folders. The browser preview uses separate browser storage.

**Not yet implemented:** Microsoft authentication, Minecraft or Java downloads, actual game launch, Fabric installation, Modrinth/CurseForge integration, import/export, crash reporting, and auto-updates. Version identifiers are currently syntax-checked, not checked against an online catalogue. The Play button explains this limitation. There is no custom client in this project.

## Run on Windows

Install Node.js 24 LTS, Rust stable with the MSVC target, Visual Studio Build Tools with Desktop development with C++, and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm run desktop:dev
```

Build a development installer:

```powershell
npm run desktop:build
```

The NSIS installer is created in `src-tauri/target/release/bundle/nsis/`. It is an unsigned development artifact, not a production release. Public distribution and signed updates are a later milestone.

Browser-only preview:

```powershell
npm run dev
```

Open http://localhost:1420. Preview data does not sync to the desktop application.

## Verification

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
cargo test --manifest-path crates/azuria-core/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

GitHub Actions runs frontend checks and builds/tests the desktop on Windows. Installer artifacts are attached to successful desktop jobs. No releases are published automatically.

## Storage and recovery

The root is Tauri’s platform-specific `app_local_data_dir()` for `com.azuria.launcher` (normally under Local AppData on Windows). It contains `azuria.sqlite3`, `instances/<UUID>/`, and `trash/<UUID>-<UUID>/`. Instance names never determine paths.

Removal moves an instance directory to trash before removing its database record. There is no restore UI yet: retain the trash folder when backing up the database. Copy settings creates an empty instance and does not copy saves or mods. Do not manually edit the SQLite database while Azuria is running.

## Project decisions

See [implementation plan](docs/PLAN.md), [architecture](docs/ARCHITECTURE.md) and [external dependencies](docs/INTEGRATIONS.md). No project licence has been chosen yet; public visibility would not by itself grant redistribution rights. A licence decision is required before public release.

# Azuria Launcher

A Windows-first launcher for Minecraft: Java Edition, built around a local instance library and a charcoal, pink and blue interface. Azuria supports dark, light and system appearance, with separate configurations for different Minecraft versions and mod loaders.

[Website](https://jamesb123450.github.io/azuria-launcher/) · [Download for Windows](https://github.com/jamesb123450/azuria-launcher/releases/latest) · [Release history](https://github.com/jamesb123450/azuria-launcher/releases) · [Report an issue](https://github.com/jamesb123450/azuria-launcher/issues)

> **Early development:** Azuria currently manages instance settings. Vanilla and Fabric launching are implemented for Windows x64, including verified game downloads and automatic Java preparation. Quilt, Forge and NeoForge cannot launch yet. Download a development build to explore the interface and follow progress.

## What is available

- **Instance library:** create, edit, favourite, search, sort and group configurations. Open an instance to manage its content, worlds, logs and settings, or switch between compact grid and list views.
- **Custom setup:** save Vanilla, Fabric, Forge, NeoForge and Quilt configurations. Browse Minecraft and loader version lists, with manual Minecraft version entry available when needed. Vanilla and Fabric configurations can launch. Quilt, Forge and NeoForge remain setup preferences; their installers are planned.
- **Instance settings:** General, Installation and Overrides tabs in a settings popup for names, icons, version preferences and per-instance configuration. Duplicate settings into an empty instance, or include verified copies of all local files.
- **Launcher settings:** a centred popup with category navigation, persistent Save and Reset controls, and an unsaved-change prompt. Reset returns pending edits to the last saved values; planned features are labelled Coming soon.
- **Game defaults:** save memory, Java executable, JVM arguments, environment variables and window preferences in Settings. Instances inherit defaults unless a custom override is enabled. These preferences apply to Vanilla and Fabric launches.
- **Local content:** import `.jar` mods and `.zip` packs, enable or disable them, retain removed files in local trash, open world folders and read existing game logs. Local actions are available in the installed desktop app.
- **Account controls:** Microsoft browser sign-in, reconnect, switch and sign-out controls on Windows. Full Minecraft account verification remains dependent on Azuria receiving Minecraft Services access.
- **Local storage and recovery:** SQLite-backed desktop settings, instance files retained in local trash after removal, and recovery of interrupted removals at startup.
- **Skins and capes:** Rotate your character preview, save a local skin library, edit names and Classic/Slim models, replace textures, and choose owned capes. Apply an appearance explicitly to your account, or reset to Minecraft’s default. Your account displays your skin head.
- **Screenshots and logs:** Browse instance screenshots, preview/export PNGs, move unwanted images to Azuria’s trash, and follow live log output with pause controls.
- **Vanilla launching:** Play prepares Mojang game files, libraries, native dependencies and assets, plus a matching Mojang Java runtime or a validated custom Java executable. Use Play/Stop and track running state and exit/crash feedback from the Library or instance page.
- **In-app updates:** published Windows builds automatically check and download signed updates at startup, with progress, release notes and a restart countdown.
- **Discover preview:** browse the proposed modpack, mod, datapack and resource-pack interface, including search, sorting and a separate filter sidebar on the right.

Discover uses fictional example projects, creators and statistics. Live Modrinth/CurseForge results, content installation, modpack upload and instance import are not connected. Unavailable actions are labelled or disabled.

## Download and update

Get the Windows installer from the [latest published release](https://github.com/jamesb123450/azuria-launcher/releases/latest). Windows is the initial supported platform; macOS and Linux builds are not currently distributed.

Azuria checks for updates on every startup and downloads available releases automatically. After signature verification, a visible 15-second countdown restarts Azuria to run the Windows installer. Choose **Later** to postpone the restart; **Settings → Launcher updates → Restart & install** finishes it when ready. Failed checks or downloads leave the current installation usable and provide a retry action.

Update packages are verified with the public signing key bundled in Azuria. This is separate from Windows Authenticode signing: development installers may still display an unknown-publisher or SmartScreen prompt.

## Accounts and local data

Microsoft sign-in opens the default browser. Authentication runs through the native Windows backend; saved refresh credentials use Windows Credential Manager. Account tokens are not exposed to the web interface or stored in the instance database. Signing out removes Azuria’s saved account without signing the browser out of Microsoft.

Windows instance settings and files are stored in `%APPDATA%\AzuriaLauncher`, with active game folders under `instances/<instance name>/`. Internal instance IDs remain stable when display names and folders change. Invalid Windows filename characters are replaced, reserved names are adjusted and name collisions receive a numbered suffix. The current app has no analytics or log-upload service.

On the first launch after this storage update, Azuria displays **Migrating data**, copies and verifies the existing library, and converts UUID folders to instance names. The original database, instance folders and trash remain in the previous local-data location as a backup. The app requires **Confirm and continue** before continuing. **Open instances folder** is a separate, optional action. Interrupted copies can be retried, and a completed migration awaiting confirmation is shown again after restart. Fresh installations do not require a migration acknowledgement. **Settings → Storage → Open instances folder** reopens the folder later.

The current storage schema is version 5. Older launcher builds cannot open it; use a matching backup if reverting to an older version. Microsoft credentials remain in Windows Credential Manager.

Removing an instance moves its desktop files into Azuria’s local trash. There is no in-app restore screen yet. The instance settings page can duplicate settings only or include all local files. Close Azuria before backing up its entire local application data directory, including the database, instance folders and trash. To recover files from a completed removal, create an instance with the original settings, close Azuria, and copy the retained files into the new instance’s named directory. Keep the original backup and trash files until the recovered data has been checked.

## Launching Minecraft

Create or select a **Vanilla** or **Fabric** instance, sign in with an account that owns Minecraft Java Edition, then press **Play**. Azuria refreshes the native Minecraft session, prepares verified files and checks Java before starting the game. First launch needs an internet connection, free disk space and additional time for downloads. Completed files are checked and reused on later attempts; a working session and metadata services are still required. This is not an offline or ownership-bypass launch mode.

Shared downloads and managed Java runtimes live in `%APPDATA%\AzuriaLauncher\game-cache`. Worlds, mods and configuration stay inside each named instance folder. JVM arguments are passed directly to Java without a shell. Tokens stay in native memory and never pass through frontend commands or launch-status events. Captured output in `logs/azuria-launch.log` is bounded and redacts the current access token and configured environment values; review game-created logs and crash reports before sharing them.

For **Fabric**, select a Minecraft version and a specific compatible Fabric loader version in Custom setup or instance settings. Play resolves the official Fabric profile, verifies its libraries and starts the Fabric client using the same account, Java settings, logs and Stop controls. Profiles are cached by Minecraft/loader pair under `game-cache/loaders/fabric`; libraries are shared in `game-cache/libraries`. Changing the selected pair prepares the new files without deleting mods, configuration or worlds. Legacy Minecraft argument formats are not supported for Fabric. Fabric API and other mods must be added separately as compatible JARs in the instance’s `mods` folder. No mod or API bundle is installed automatically.

Keep Azuria open while Minecraft runs. This initial implementation blocks normal launcher closure, instance rename/removal and updater installation during an active game or preparation. Close Minecraft through its game menu to save normally; Stop cancels preparation or terminates Minecraft after a warning about unsaved changes. Forced process termination cannot provide the same protection. Forge, NeoForge and Quilt launching are not included. Versions that require unsupported metadata or platform rules report an error instead of guessing launch arguments.

## Development direction

The next core work is broader loader support and live Modrinth/CurseForge discovery. Modpack import/export and broader content management are also planned.

Planned features are not promises of a release date.

## Build from source

The desktop app uses **Vue 3, TypeScript and Pinia** for the interface, **Tauri 2 and Rust** for native integration, and **SQLite** for local storage.

For Windows development, install Node.js 24, stable Rust, WebView2 and Visual Studio Build Tools with **Desktop development with C++**. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for native setup.

```powershell
git clone https://github.com/jamesb123450/azuria-launcher.git
cd azuria-launcher
npm ci
npm run desktop:dev
```

To run the interface in a browser:

```powershell
npm run dev
```

Open [localhost:1420](http://localhost:1420). The browser preview has its own local data and does not share the desktop library. Microsoft sign-in and desktop updates are unavailable there.

To build a Windows installer:

```powershell
npm run desktop:build
```

Installer output: `src-tauri/target/release/bundle/nsis/`.

### Checks and releases

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
```

GitHub Actions also runs Rust tests, formatting, Clippy and Windows build checks. Browser tests exercise the interface; native installation, authentication and updates need Windows testing.

With automatic releases enabled, launcher changes merged into `main` run the checks, build a signed update and publish it after successful validation. Release descriptions come from [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md); app changes should update that file in the same PR. Website-only and README-only changes do not publish a launcher release.

## Website and documentation

The [public website](https://jamesb123450.github.io/azuria-launcher/) is hosted on GitHub Pages. Its source lives in [`website/`](website/) in this repository, with a separate static build and deployment workflow. Download links and release information use published GitHub releases.

- [Privacy policy](https://jamesb123450.github.io/azuria-launcher/privacy/)
- [Terms of service](https://jamesb123450.github.io/azuria-launcher/terms/)

## Feedback and licence

Report bugs and suggest improvements through [GitHub Issues](https://github.com/jamesb123450/azuria-launcher/issues). Include the app version, Windows version and steps to reproduce a problem. Keep account credentials, tokens and personal data out of public reports.

The source is publicly viewable, but a project licence has not been selected. Dependency and asset licences continue to apply; see the licence files alongside assets and [Inter’s font licence](docs/FONT-LICENSE.txt).

Azuria is an independent project and is not affiliated with or endorsed by Mojang or Microsoft.

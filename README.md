# Azuria Launcher

A Windows-first launcher for Minecraft: Java Edition, built around a local instance library and a charcoal, pink and blue interface. Azuria supports dark, light and system appearance, with separate configurations for different Minecraft versions and mod loaders.

[Website](https://jamesb123450.github.io/azuria-launcher/) · [Download for Windows](https://github.com/jamesb123450/azuria-launcher/releases/latest) · [Release history](https://github.com/jamesb123450/azuria-launcher/releases) · [Report an issue](https://github.com/jamesb123450/azuria-launcher/issues)

> **Early development:** Azuria currently manages instance settings. Game downloads, Java setup and launching are not available yet. Minecraft Services access for Microsoft sign-in is pending review. Download a development build to explore the interface and follow progress.

## What is available

- **Instance library:** create, edit, favourite, search, sort and group configurations. Select an instance to see its version and loader details, or switch between compact grid and list views.
- **Custom setup:** save Vanilla, Fabric, Forge, NeoForge and Quilt configurations. Browse Minecraft and loader version lists, with manual Minecraft version entry available when needed. These are configuration choices; installation and compatibility checks are still planned.
- **Instance identity:** upload an icon or customise its colour and shape. Copy settings into a separate, empty instance without copying game files.
- **Account controls:** Microsoft browser sign-in, reconnect, switch and sign-out controls on Windows. Full Minecraft account verification remains dependent on Azuria receiving Minecraft Services access.
- **Local storage and recovery:** SQLite-backed desktop settings, instance files retained in local trash after removal, and recovery of interrupted removals at startup.
- **In-app updates:** published Windows builds can check for signed updates and install them from Settings.
- **Discover preview:** browse the proposed modpack, mod, datapack and resource-pack interface, including search, sorting and a separate filter sidebar on the right.

Discover uses fictional example projects, creators and statistics. Live Modrinth/CurseForge results, content installation, modpack upload and instance import are not connected. Unavailable actions are labelled or disabled.

## Download and update

Get the Windows installer from the [latest published release](https://github.com/jamesb123450/azuria-launcher/releases/latest). Windows is the initial supported platform; macOS and Linux builds are not currently distributed.

Existing users can open **Settings → Launcher updates** and choose **Update & restart** when an update is available. The app also checks at startup; installing an update requires a user action.

Update packages are verified with the public signing key bundled in Azuria. This is separate from Windows Authenticode signing: development installers may still display an unknown-publisher or SmartScreen prompt.

## Accounts and local data

Microsoft sign-in opens the default browser. Authentication runs through the native Windows backend; saved refresh credentials use Windows Credential Manager. Account tokens are not exposed to the web interface or stored in the instance database. Signing out removes Azuria’s saved account without signing the browser out of Microsoft.

Windows instance settings and files are stored in `%APPDATA%\AzuriaLauncher`, with active game folders under `instances/<instance name>/`. Internal instance IDs remain stable when display names and folders change. Invalid Windows filename characters are replaced, reserved names are adjusted and name collisions receive a numbered suffix. The current app has no analytics or log-upload service.

On the first launch after this storage update, Azuria displays **Migrating data**, copies and verifies the existing library, and converts UUID folders to instance names. The original database, instance folders and trash remain in the previous local-data location as a backup. The app requires **Confirm and open instances** before continuing; this opens the new instances folder in File Explorer. Interrupted copies can be retried, and a completed migration awaiting confirmation is shown again after restart. Fresh installations do not require a migration acknowledgement. **Settings → Storage & privacy → Open instances folder** reopens the folder later.

The new storage schema is version 4. Older launcher builds cannot open it; use a matching backup if reverting to an older version. Microsoft credentials remain in Windows Credential Manager.

Removing an instance moves its desktop files into Azuria’s local trash. There is no in-app restore screen yet. Copying an instance copies its settings only. Close Azuria before backing up its entire local application data directory, including the database, instance folders and trash. To recover files from a completed removal, create an instance with the original settings, close Azuria, and copy the retained files into the new instance’s named directory. Keep the original backup and trash files until the recovered data has been checked.

## Development direction

The next core work is Minecraft account verification, verified Minecraft and Java downloads, and a working Vanilla launch. Fabric installation and live Modrinth/CurseForge discovery follow that foundation. Modpack import/export and broader content management are also planned.

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

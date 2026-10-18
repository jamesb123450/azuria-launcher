# Azuria Launcher

A Windows-first launcher for Minecraft: Java Edition, built around a local instance library and a charcoal, pink and blue interface. Azuria supports dark, OLED, light and system appearance, with separate configurations for different Minecraft versions and mod loaders.

[Website](https://jamesb123450.github.io/azuria-releases/) · [Download for Windows](https://github.com/jamesb123450/azuria-releases/releases/latest) · [Release history](https://github.com/jamesb123450/azuria-releases/releases) · [Report an issue](https://github.com/jamesb123450/azuria-releases/issues)

> **Early development:** Azuria currently manages instance settings. Vanilla and Fabric launching are implemented for Windows x64, including verified game downloads and automatic Java preparation. Quilt, Forge and NeoForge cannot launch yet. Download a development build to explore the interface and follow progress.

## What is available

- **Instance library:** create, edit, favourite, search, sort and group configurations. Open an instance to manage its content, worlds, logs and settings, or switch between compact grid and list views.
- **Custom setup:** save Vanilla, Fabric, Forge, NeoForge and Quilt configurations. Browse Minecraft and loader version lists, with manual Minecraft version entry available when needed. Vanilla and Fabric configurations can launch. Quilt, Forge and NeoForge remain setup preferences; their installers are planned.
- **Instance settings:** General, Installation and Overrides tabs in a settings popup for names, icons, version preferences and per-instance configuration. Duplicate settings into an empty instance, or include verified copies of all local files.
- **Launcher settings:** a centred popup with category navigation, persistent Save and Reset controls, and an unsaved-change prompt. Save and Reset appear only while edits are pending, in a detached action bar. Reset restores the last saved values; planned features are labelled Coming soon.
- **Game defaults:** save memory, Java executable, JVM arguments, environment variables and window preferences in Settings. Instances inherit defaults unless a custom override is enabled. These preferences apply to Vanilla and Fabric launches.
- **Local content:** import `.jar` mods and `.zip` packs, enable or disable them, retain removed files in local trash, open world folders and read existing game logs. Local actions are available in the installed desktop app.
- **Account controls:** Microsoft browser sign-in, reconnect, switch and sign-out controls on Windows. Full Minecraft account verification remains dependent on Azuria receiving Minecraft Services access.
- **Local storage and recovery:** SQLite-backed desktop settings, instance files retained in local trash after removal, and recovery of interrupted removals at startup.
- **Skins and capes:** Rotate your character preview, save a local skin library, edit names and Classic/Slim models, replace textures, and choose owned capes. Apply an appearance explicitly to your account, or reset to Minecraft’s default. Your account displays your skin head.
- **Screenshots and logs:** Browse instance screenshots, preview/export PNGs, move unwanted images to Azuria’s trash, and follow live log output with pause controls.
- **Vanilla launching:** Play prepares Mojang game files, libraries, native dependencies and assets, plus a matching Mojang Java runtime or a validated custom Java executable. Use Play/Stop and track running state and exit/crash feedback from the Library or instance page.
- **In-app updates:** published Windows builds automatically check and download signed updates at startup, with progress, release notes and a restart countdown.
- **Discover:** search live Modrinth and CurseForge catalogues for mods, modpacks, datapacks and resource packs, with compatible version selection, required dependencies and verified downloads. Real project artwork opens a detail page with the provider description, versions and gallery. Filters remain in a separate sidebar on the right.

Modrinth works without an API key. CurseForge uses Azuria’s publisher-operated Cloudflare service; users do not enter API keys in the app. The key is held in the private source repository’s Actions secrets and deployed as a Worker secret, never bundled in installers or public releases. Setup and rotation instructions are in [the private service guide](services/curseforge/README.md). Builds without a configured service URL explain that CurseForge is unavailable. Author download restrictions are respected.

Choose an instance and a compatible content version, then review the download before installing. Datapacks require an existing world. Modpacks create new Vanilla or Fabric instances and start game-file preparation without launching Minecraft. Other pack loaders remain unsupported. Required dependencies are included; optional client files are skipped. Modrinth packs with files hosted outside Modrinth’s CDN currently report an unsupported-host error.

Modpack instances keep additional content on the instance page. **View content** opens the pack’s searchable file popup; **Switch version** lists compatible releases, beta and alpha versions with provider names, dates and changelogs. Changes require review before installation. Content installs preserve different existing files and stop on conflicts. Instance pages check for compatible stable releases and missing pack files. Review Update or Repair before applying changes. Replaced files are retained under `.azuria/backups` inside the instance; edited configuration, worlds and additional files are preserved. Modified mod or pack archives stop the update for manual conflict resolution. Pack updates keep the current Minecraft version and loader family; install a separate instance to move between them. Downloads stage separately, verify hashes, and record a recovery journal before publication. Provider search and downloads contact the selected service; search errors do not display sample results. Browser previews support public Modrinth search, but installation and CurseForge configuration require the desktop app.

## Privacy, settings and window behaviour

Settings → Privacy controls automatic account reconnection, hiding your account name and skin head in the launcher, and Discord activity sharing. Discord is the same saved preference in Privacy and Behaviour. Azuria has no analytics or automatic log-upload service; authentication, update checks and content requests still contact their providers. Hiding account details does not conceal information inside Minecraft or the skin editor.

Memory controls detect the computer’s physical RAM and use it as the allocation ceiling, including computers above 64 GiB. Allocations use 256 MiB steps; leave memory for Windows and other applications. Storage download concurrency ranges from 1 to 10; existing larger saved limits are reduced to 10. Browser previews use an approximate memory estimate; the installed Windows app reads and validates physical memory natively.

A startup screen remains visible while local storage and the library open. Migration acknowledgement is still required only when migration actually needs it. Closing the Windows window keeps Azuria in the system tray, including while Minecraft runs. Click the tray icon or choose Open Azuria to return. Quit Azuria exits when games and downloads are idle; active tasks keep the launcher available for monitoring. If tray creation fails, the window is never hidden without a way to reopen it.

The topbar shows each running instance by name, with Stop and Open logs controls. Preparation is not shown as a running game.

## Behaviour and Discord activity

Settings → Behaviour provides saved defaults for minimising when Minecraft starts, refocusing after the last game closes, hiding the right sidebar and using the compact library. Save applies edits; Reset restores the last saved choices. Library layout and sidebar controls remain available for temporary changes.

Configured Windows builds can show generic **Playing Minecraft** activity in Discord while Minecraft is running. Preparation alone does not publish activity. The launcher clears activity when the last game exits or Discord Rich Presence is turned off in Behaviour. No account, instance, world or server names are sent; activity includes the game start time. Discord being unavailable never prevents launching.

### Enable Discord in distributed builds

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications). Its display name appears in Discord alongside the Playing Minecraft activity.
2. Copy its **Application ID**. This is a public numeric identifier; do not use a bot token, client secret or Microsoft client ID.
3. In the **azuria-launcher source repository**, open **Settings → Secrets and variables → Actions → Variables → New repository variable**. Name it `AZURIA_DISCORD_APPLICATION_ID` and paste the Application ID as its value.
4. Build a new Windows release after adding the variable. Existing installers cannot gain this build-time setting without an update. For local builds, set the same environment variable before running `npm run desktop:build`.

Discord must be running with activity sharing enabled. Builds without a valid Application ID retain the preference but do not connect to Discord. Users can disable it in **Settings → Behaviour → Discord Rich Presence**.

## Download and update

Get the Windows installer from the [latest published release](https://github.com/jamesb123450/azuria-releases/releases/latest). Windows is the initial supported platform; macOS and Linux builds are not currently distributed.

Azuria checks for updates on every startup and downloads available releases automatically. After signature verification, a visible 15-second countdown restarts Azuria to run the Windows installer. Choose **Later** to postpone the restart; **Settings → Launcher updates → Restart & install** finishes it when ready. Failed checks or downloads leave the current installation usable and provide a retry action.

Update packages are verified with the public signing key bundled in Azuria. This is separate from Windows Authenticode signing: development installers may still display an unknown-publisher or SmartScreen prompt.

## Windows setup

The Windows installer uses Azuria artwork and native, keyboard-accessible setup controls. Only first installation requires accepting the included offline privacy policy before continuing. Cancel exits setup. Automatic updates use a separate update flow without an acceptance page, including updates from older releases. Manual upgrades and reinstalls of an existing installation do not ask again. Acceptance does not enable optional features or tracking.

Installer sources, policy maintenance and validation are documented in [the installer guide](src-tauri/installer/README.md).

## Accounts and local data

Microsoft sign-in opens the default browser. Authentication runs through the native Windows backend; saved refresh credentials use Windows Credential Manager. Account tokens are not exposed to the web interface or stored in the instance database. Signing out removes Azuria’s saved account without signing the browser out of Microsoft.

Windows instance settings and files are stored in `%APPDATA%\AzuriaLauncher`, with active game folders under `instances/<instance name>/`. Internal instance IDs remain stable when display names and folders change. Invalid Windows filename characters are replaced, reserved names are adjusted and name collisions receive a numbered suffix. The current app has no analytics or log-upload service.

On the first launch after this storage update, Azuria displays **Migrating data**, copies and verifies the existing library, and converts UUID folders to instance names. The original database, instance folders and trash remain in the previous local-data location as a backup. The app requires **Confirm and continue** before continuing. **Open instances folder** is a separate, optional action. Interrupted copies can be retried, and a completed migration awaiting confirmation is shown again after restart. Fresh installations do not require a migration acknowledgement. **Settings → Storage → Open instances folder** reopens the folder later.

The current storage schema is version 5. Older launcher builds cannot open it; use a matching backup if reverting to an older version. Microsoft credentials remain in Windows Credential Manager.

Removing an instance moves its desktop files into Azuria’s local trash. There is no in-app restore screen yet. The instance settings page can duplicate settings only or include all local files. Close Azuria before backing up its entire local application data directory, including the database, instance folders and trash. To recover files from a completed removal, create an instance with the original settings, close Azuria, and copy the retained files into the new instance’s named directory. Keep the original backup and trash files until the recovered data has been checked.

## Launching Minecraft

Create or select a **Vanilla** or **Fabric** instance, sign in with an account that owns Minecraft Java Edition, then press **Play**. Creating a Vanilla or Fabric instance first downloads and verifies its files in the background without opening Minecraft or requiring sign-in. Use Stop to cancel, then Resume download or Retry download if needed. Azuria refreshes the native Minecraft session, prepares verified files and checks Java before starting the game. Initial preparation needs an internet connection, free disk space and time for downloads. Play reuses verified files, checks for missing content and refreshes the account before starting Minecraft. Completed files are checked and reused on later attempts; a working session and metadata services are still required. This is not an offline or ownership-bypass launch mode.

Shared downloads and managed Java runtimes live in `%APPDATA%\AzuriaLauncher\game-cache`. Worlds, mods and configuration stay inside each named instance folder. JVM arguments are passed directly to Java without a shell. Tokens stay in native memory and never pass through frontend commands or launch-status events. Captured output in `logs/azuria-launch.log` is bounded and redacts the current access token and configured environment values; review game-created logs and crash reports before sharing them.

For **Fabric**, select a Minecraft version and a compatible Fabric loader version in Custom setup or instance settings. Stable and Latest are resolved to concrete versions when saved; historical selections are pinned during their next preparation. Fabric profiles for Minecraft 26.1 and later do not require intermediary mappings. Preparation resolves the official Fabric profile, verifies its libraries and starts the Fabric client using the same account, Java settings, logs and Stop controls. Profiles are cached by Minecraft/loader pair under `game-cache/loaders/fabric`; libraries are shared in `game-cache/libraries`. Changing the selected pair prepares the new files without deleting mods, configuration or worlds. Legacy Minecraft argument formats are not supported for Fabric. Fabric API and other mods must be added separately as compatible JARs in the instance’s `mods` folder. No mod or API bundle is installed automatically.

Keep Azuria open while Minecraft runs. This initial implementation blocks normal launcher closure, instance rename/removal and updater installation during an active game or preparation. Close Minecraft through its game menu to save normally; Stop cancels preparation or terminates Minecraft after a warning about unsaved changes. Forced process termination cannot provide the same protection. Forge, NeoForge and Quilt launching are not included. Versions that require unsupported metadata or platform rules report an error instead of guessing launch arguments.

## Development direction

The next core work is broader loader support, content updates and broader modpack import/export support.

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

The [public website](https://jamesb123450.github.io/azuria-releases/) is hosted on GitHub Pages. Its source lives in [`website/`](website/) in this repository, with a separate static build workflow that publishes compiled output to the public distribution repository. Download links and release information use published GitHub releases.

- [Privacy policy](https://jamesb123450.github.io/azuria-releases/privacy/)
- [Terms of service](https://jamesb123450.github.io/azuria-releases/terms/)

## Feedback and licence

Report bugs and suggest improvements through [GitHub Issues](https://github.com/jamesb123450/azuria-releases/issues). Include the app version, Windows version and steps to reproduce a problem. Keep account credentials, tokens and personal data out of public reports.

A project licence has not been selected. Dependency and asset licences continue to apply; see the licence files alongside assets and [Inter’s font licence](docs/FONT-LICENSE.txt).

Azuria is an independent project and is not affiliated with or endorsed by Mojang or Microsoft.

## Maintainer configuration

### Website advertising

Paste your complete **display ad-unit** snippet into [`website/src/adsense.html`](website/src/adsense.html). This source-only slot renders on the website home page, above the latest-release notice. There is no public configuration form. It is never loaded by the Windows launcher: standard AdSense does not support desktop software.

In Google AdSense, open **Ads → By ad unit → Display ads → Save and get code**. Before enabling, add and obtain approval for your website and configure/publish a Google-certified consent message, for example **Privacy & messaging → European regulations**. Review the advertising disclosures and regional settings for your audience.

In this repository, open **Settings → Secrets and variables → Actions → Variables** and add `AZURIA_ADSENSE_ENABLED=true` and `AZURIA_ADSENSE_CMP_READY=true` only after setup is complete. Then run **Actions → Website build and deploy → Run workflow → main**. Remove the enabled variable or set it to `false` to disable advertising. Both flags default to off; an enabled build rejects a missing/incomplete snippet. Google controls approval and ad availability. Publisher and ad-slot identifiers in the snippet are public identifiers, not API secrets.

### Private API keys

Keep a retrievable original in an encrypted password-manager vault belonging only to you. Create separate entries for each service/environment, enable MFA on the vault account, and retain its recovery information securely. Do not paste keys into issues, PRs, snippets or frontend configuration.

For publisher CurseForge access, use the **private source repository → Settings → Secrets and variables → Actions → Secrets**. Store `CURSEFORGE_API_KEY` there with a separate vault copy. The manual [CurseForge service deployment](services/curseforge/README.md) transfers it to a Cloudflare Worker secret. Users cannot enter or retrieve keys through launcher settings.

Never print credentials or substitute them into Vue/Vite source, website output or distributed installers. The launcher only receives the service’s public URL; validated routes, bounded requests and rate limits protect access. GitHub secrets do not provide a way to read the stored value back, so keep your vault copy for personal access.

## Public distribution setup

Builds run in this source repository. Signed installers, updater metadata and release notes are published to **jamesb123450/azuria-releases**. Only the compiled website is copied into its `site/` folder; launcher source and git history are not copied. Keep the existing Tauri signing secrets unchanged.

Set up the migration in this order:

1. Merge the distribution-host setup PR in `azuria-releases`. In that repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
2. Create a **fine-grained personal access token** at <https://github.com/settings/personal-access-tokens/new>. Choose the owning account, select **Only select repositories → azuria-releases**, and grant **Repository permissions → Contents: Read and write**. Set an expiry you can maintain.
3. In **azuria-launcher → Settings → Secrets and variables → Actions → Secrets → New repository secret**, save it as **AZURIA_RELEASES_TOKEN**. Never put the token in code or chat. Keep existing signing secrets and automatic release variables.
4. Merge the source migration PR. Foundation checks will publish the next numbered signed release to the public repository and, while the source remains public, publish a bridge release at the old address. The website workflow publishes compiled files to the public repository, whose Pages workflow deploys them.
5. Verify the public installer, `latest.json`, website and an installed client's update to this bridge release **before** making the source repository private. Source privacy is changed manually, never by these workflows.

Existing clients must install the bridge update before the source becomes private. Clients that miss it will need the public installer once, because their old updater address will become inaccessible. Subsequent releases use the new public address, retain signatures, continue version numbering and include `docs/RELEASE_NOTES.md`. Making a formerly public repository private cannot recall existing copies of its source.

The website is served at <https://jamesb123450.github.io/azuria-releases/>. Its source remains in `website/`; the distribution repository stores only the built output. Update the token secret before its expiry. If publication fails, inspect incomplete draft releases before retrying; published version tags are never overwritten automatically.

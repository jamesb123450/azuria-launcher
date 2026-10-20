# Azuria Launcher frontend

Vue, TypeScript, Pinia and Vite interface for Azuria Launcher. Native Rust code, window/installer configuration and packaging live in [`../app`](../app).

Install dependencies with `npm ci` from the repository root, then use:

```sh
npm run dev
npm run launcher:check
npm run test:e2e
```

To build only this interface, run `npm run build --workspace=azuria-launcher-frontend` from the root. The output is this workspace's `dist/` directory. Tauri's native build hook builds that output and packages it; do not move generated files into the native source tree.

UI unit tests and browser tests belong in `tests/`. Browser previews use their own local data; accounts, native storage and updates still require the installed Windows app. The interface continues to communicate with native commands through Tauri IPC. See the [product guide](../app/README.md) and [monorepo guide](../../docs/MONOREPO.md).

The launcher opens on Home, with version browsing and custom setups under Versions. See the [redesign guide](docs/REDESIGN.md) for the visual system, asset sources and automatic setup behaviour.

## Instance launch and settings

Home’s Play arrow opens Minecraft versions. The hero gear offers Global settings (launcher Java and memory defaults) and Profile settings (Java and memory overrides for the selected quick-play setup). The gear beside Launch on Versions opens that setup’s content page without launching Minecraft.

The instance page keeps content beside Minecraft artwork and launch controls. Its settings popup includes Files, Java Environment, Versions, Notes and Export. Memory and window controls remain visible but blurred and disabled when inherited. Existing general/overrides/installation deep links still work. Version changes retain instance files and ask for confirmation because mods and worlds may be incompatible.

Notes are plain Markdown, saved per instance with a 64 KB limit. Export supports Azuria setup JSON (identity, version, loader, memory/window overrides; excludes Java paths, custom JVM arguments and environment variables) and a Minecraft folder ZIP in the Windows app. Setup JSON describes a setup; it is not a modpack bundle. Folder exports reserve the instance against launching or content changes, reject linked/special files, and must be saved outside the game directory. No proprietary launcher export formats are claimed.

## Activity and game monitor

Versions uses one toolbar: switch between the Minecraft catalogue and saved profiles, search, include older builds, or create a profile. Home and the profile library share a Friends coming-soon panel with two square advertisement placeholders. No live advertising or friends data is simulated.

The titlebar includes Notifications, Downloads and tasks, the account menu, and a compact running-instance count. Tasks track real game preparation, content installs and updater events, retain completed results for the current session, and support cancelling supported active operations or clearing finished entries. Notifications retain launcher notices and task results for the current session. Downloads cannot be paused by the native backend, so the interface offers cancellation rather than a cosmetic pause control.

The button beside the running count opens a separate native Game monitor window for the first running instance; its running-instance menu can open any other running game. Reopening the same monitor focuses its existing window. Closing a monitor leaves Minecraft and the main launcher running. Logs retain filtering, pause, follow, copy and local export. The screenshot area uses the same instance’s actual PNG files, with search, sorting, preview, export, open-folder and trash controls. Both monitor views share two square ad slots. Browser previews render the monitor as a route; creating and focusing native windows requires the Windows app.

## Profile content and discovery

Profile headers expose Mods (for modded profiles), Resource packs, Shaders, Worlds, Logs, Gallery and Settings. The current tab controls the file list and Add content destination. Shader packs remain local imports because the provider backend does not support a shader catalogue. Modpack-managed files keep their separate content viewer and pack-version workflow.

Update all reviews the visible, selected if applicable, independently managed projects with available updates. It fetches the compatible version names before confirmation. On confirmation the content store creates a fresh native update plan for each exact reviewed version and installs sequentially, waiting for that plan’s native terminal status before continuing. A failed or cancelled update stops the queue; already completed projects stay updated. The queue survives page navigation, supports cancellation between jobs, and uses existing native collision checks and backups.

Discover carries the profile and content kind in its route. Selecting a target applies its Minecraft version and, for mods, loader to search. Install dialogs prefer that explicit target, and project detail/back links retain it. Modpack installation still creates a separate profile. No compatibility or project metadata is fabricated.

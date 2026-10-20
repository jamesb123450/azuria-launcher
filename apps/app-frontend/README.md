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

Home’s Play arrow opens Saved setups. The hero gear offers Global settings (launcher Java and memory defaults) and Profile settings (Java and memory overrides for the selected quick-play setup). The gear beside Launch on Versions opens that setup’s content page without launching Minecraft.

The instance page keeps content beside Minecraft artwork and launch controls. Its settings popup includes Files, Java Environment, Versions, Notes and Export. Memory and window controls remain visible but blurred and disabled when inherited. Existing general/overrides/installation deep links still work. Version changes retain instance files and ask for confirmation because mods and worlds may be incompatible.

Notes are plain Markdown, saved per instance with a 64 KB limit. Export supports Azuria setup JSON (identity, version, loader, memory/window overrides; excludes Java paths, custom JVM arguments and environment variables) and a Minecraft folder ZIP in the Windows app. Setup JSON describes a setup; it is not a modpack bundle. Folder exports reserve the instance against launching or content changes, reject linked/special files, and must be saved outside the game directory. No proprietary launcher export formats are claimed.

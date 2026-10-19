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

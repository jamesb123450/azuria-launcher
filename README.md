# Azuria Studios

Private monorepo for Azuria Studios products, services and shared code.

| Project              | Directory                                          | Development                                            |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Azuria Launcher      | [`apps/launcher`](apps/launcher)                   | `npm run launcher:dev`                                 |
| Launcher website     | [`apps/launcher-website`](apps/launcher-website)   | `npm run website:build` then `npm run website:preview` |
| CurseForge service   | [`services/curseforge`](services/curseforge)       | `npm run service:test`                                 |
| Shared release tools | [`packages/release-tools`](packages/release-tools) | `npm run test --workspace=@azuria/release-tools`       |

## Getting started

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev
```

`npm run dev` starts the launcher browser preview. Native Windows development additionally requires Rust, WebView2 and Visual Studio C++ Build Tools; see the [launcher guide](apps/launcher/README.md).

```sh
npm run build
npm test
npm run test:e2e
```

Each product is an npm workspace. Install once at the root; use the commands above or `npm run <script> --workspace=<name>` to work on a particular product. Rust crates remain inside the launcher so native paths and lockfiles stay together.

## Deployment and releases

Products have separate build/deployment workflows. Launcher releases retain their signing configuration, Windows identity and public update host: [azuria-releases](https://github.com/jamesb123450/azuria-releases). This repository and its source history are never published there. CurseForge deployment remains manual, with credentials in Actions and Worker secrets.

The website lives at [launcher.azuriasmp.org](https://launcher.azuriasmp.org/). For Vercel, set **Root Directory** to `apps/launcher-website` and keep the build/output settings in the [migration guide](docs/MONOREPO.md). The GitHub website workflow retains the existing public distribution copy.

See [monorepo layout, adding products and migration checks](docs/MONOREPO.md). No repository rename, domain change or deployment is performed by this migration.

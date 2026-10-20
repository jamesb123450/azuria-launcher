# Azuria Studios

Private monorepo for Azuria Studios products, services and shared code.

| Project                | Directory                                          | Development                                            |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Launcher native app    | [`apps/app`](apps/app)                             | `npm run launcher:dev`                                 |
| Launcher Vue interface | [`apps/app-frontend`](apps/app-frontend)           | `npm run dev`                                          |
| Launcher website       | [`apps/frontend`](apps/frontend)                   | `npm run website:build` then `npm run website:preview` |
| Azuria account website | [`apps/accounts/frontend`](apps/accounts/frontend) | `npm run accounts:build`                               |
| Azuria account service | [`services/accounts`](services/accounts)           | See [account setup](docs/ACCOUNTS_SETUP.md)            |
| CurseForge service     | [`services/curseforge`](services/curseforge)       | `npm run service:test`                                 |
| Shared release tools   | [`packages/release-tools`](packages/release-tools) | `npm run test --workspace=@azuria/release-tools`       |

## Getting started

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run dev
```

`npm run dev` starts the launcher browser preview. Native Windows development additionally requires Rust, WebView2 and Visual Studio C++ Build Tools; see the [launcher guide](apps/app/README.md).

```sh
npm run build
npm test
npm run test:e2e
```

JavaScript projects are npm workspaces. Install once at the root; use the commands above or `npm run <script> --workspace=<name>` to work on a particular component. The native launcher packages the separate Vue frontend. Rust libraries live under `packages/azuria-auth`, `packages/azuria-core`, `packages/azuria-content` and `packages/azuria-launch`, each with its Cargo manifest and lockfile. `npm run build` builds the Vue frontend and website; `npm run launcher:build` explicitly packages the native app.

## Deployment and releases

Products have separate build/deployment workflows. Launcher releases retain their signing configuration, Windows identity and public update host: [azuria-releases](https://github.com/jamesb123450/azuria-releases). This repository and its source history are never published there. CurseForge deployment remains manual, with credentials in Actions and Worker secrets.

The website lives at [launcher.azuriasmp.org](https://launcher.azuriasmp.org/). For Vercel, set **Root Directory** to `apps/frontend` and keep the build/output settings in the [migration guide](docs/MONOREPO.md). The GitHub website workflow retains the existing public distribution copy.

See [monorepo layout, adding products and migration checks](docs/MONOREPO.md). No repository rename, domain change or deployment is performed by this migration.

## Azuria accounts

Account pages are prepared for **accounts.azuriasmp.org**, backed by Supabase.
Follow [the account setup guide](docs/ACCOUNTS_SETUP.md) for database migrations,
email delivery, Vercel deployment and credential storage. The launcher’s Azuria
account is separate from its Microsoft/Minecraft account.

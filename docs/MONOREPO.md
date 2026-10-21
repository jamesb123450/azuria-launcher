# Azuria Studios monorepo

## Layout and ownership

`apps/` contains independently shipped products. `services/` contains hosted backends. `packages/` contains code actually shared between products. Add infrastructure source under `infrastructure/` when a real deployment needs it; do not commit live worlds, databases, backups, credentials or generated builds. New websites and services need their own build and deployment configuration.

The native launcher owns Tauri configuration, Rust IPC/window code, installer, release notes and publishing tests under `apps/app/`. Its Vue interface, UI assets, Vite configuration, UI unit tests and browser tests live in `apps/app-frontend/`. Native configuration sits at the native workspace root, with `frontendDist` pointing to `../app-frontend/dist`. The build/dev hooks invoke that frontend workspace; they never invoke the native packaging script recursively. Rust libraries live in `packages/azuria-auth`, `packages/azuria-core`, `packages/azuria-content` and `packages/azuria-launch`. Each keeps its existing Cargo manifest and lockfile; native path dependencies point there. The website owns its source, static assets, release metadata and publishing script under `apps/frontend/`. Shared release-host identifiers and safe publication-error formatting live in `packages/release-tools/`.

## Installation and checks

Use Node.js 24. Run `npm ci` at the root, which owns the only npm lockfile. Never install separately inside a workspace. Root commands forward to the correct workspace and working directory. `npm run build` builds the Vue interface and website; native packaging is explicit through `npm run launcher:build`. `npm test` runs release-routing checks and all JavaScript workspace unit/site/service tests after a frontend/website build. `npm run website:test` builds and tests just the website. `npm run test:e2e` runs launcher browser tests. Windows-only checks continue in Foundation checks.

## Deployment

The launcher website uses Vercel Root Directory `apps/frontend`, build command
`npm run build`, output `dist` and Framework Preset Other. Enable access to files
outside the root directory for shared workspace imports. Use the repository root
workspace install (`npm ci --prefix ../..`) if overriding Install Command, and
set `AZURIA_SITE_URL=https://launcher.azuriasmp.org/`.

The studios website (`apps/azuria-studios/frontend`) and account website
(`apps/accounts/frontend`) have separate Vercel projects. Product READMEs and
`docs/ACCOUNTS_SETUP.md` describe their current configuration.

`azuria-releases` hosts compiled signed launcher updates and the static website
copy. Keep the launcher application identifier, update URL and signing key stable.
CurseForge deployment is manual and uses `services/curseforge`.

## Release boundaries

Foundation checks runs for either launcher component, the four Rust library packages, shared release tools, root workspace manifests and its workflow/routing changes. Publishing is separately gated on either launcher component or their shared build-dependency changes. Website, other apps, service, infrastructure and general documentation changes alone cannot publish a launcher release. Root lockfile changes conservatively count as launcher dependencies because all workspaces share the lockfile.

The website workflow follows its own paths and schedule, validates an artifact before publication, and retains its existing main-only publishing guard. Workspace and service checks validate routing and shared/service tests. CurseForge deployment remains an explicit manual workflow. PRs cannot publish releases or deploy the Worker.

## Adding a product

Create `apps/<product>/package.json` or `services/<service>/package.json` with a unique name and `private: true`. Use shared packages only where code is genuinely reused. Add scoped build/test commands, a path-scoped workflow and a deployment guide. Run `npm install --package-lock-only` at the root and commit the updated lockfile. Review release dependencies before adding a shared package used by the launcher to the routing rules.

Use repository/environment secrets for hosted credentials. A private repository does not protect a secret compiled into a public website or installer. Keep product deployments and runtime data separate even when source lives together.

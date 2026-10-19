# Azuria Studios monorepo

## Layout and ownership

`apps/` contains independently shipped products. `services/` contains hosted backends. `packages/` contains code actually shared between products. Add infrastructure source under `infrastructure/` when a real deployment needs it; do not commit live worlds, databases, backups, credentials or generated builds. New websites and services need their own build and deployment configuration.

The native launcher owns Tauri configuration, Rust IPC/window code, installer, release notes and publishing tests under `apps/launcher/`. Its Vue interface, UI assets, Vite configuration, UI unit tests and browser tests live in `apps/launcher-frontend/`. Native configuration sits at the native workspace root, with `frontendDist` pointing to `../launcher-frontend/dist`. The build/dev hooks invoke that frontend workspace; they never invoke the native packaging script recursively. Rust libraries live in `packages/azuria-auth`, `packages/azuria-core`, `packages/azuria-content` and `packages/azuria-launch`. Each keeps its existing Cargo manifest and lockfile; native path dependencies point there. The website owns its source, static assets, release metadata and publishing script under `apps/launcher-website/`. Shared release-host identifiers and safe publication-error formatting live in `packages/release-tools/`.

## Installation and checks

Use Node.js 24. Run `npm ci` at the root, which owns the only npm lockfile. Never install separately inside a workspace. Root commands forward to the correct workspace and working directory. `npm run build` builds the Vue interface and website; native packaging is explicit through `npm run launcher:build`. `npm test` runs release-routing checks and all JavaScript workspace unit/site/service tests after a frontend/website build. `npm run website:test` builds and tests just the website. `npm run test:e2e` runs launcher browser tests. Windows-only checks continue in Foundation checks.

## Migration deployment checklist

1. Review and merge the migration PR after checks. Keep existing Tauri signing secrets, Discord/client identifiers, application identifier and public updater URL unchanged.
2. In the existing Vercel project's Settings, change **Root Directory** from `website` to `apps/launcher-website`. Keep **Build Command** `npm run build`, **Output Directory** `dist`, and **Framework Preset** Other. Enable inclusion of files outside the root directory because the website uses the shared workspace package. Use the repository root workspace install (`npm ci --prefix ../..`) if overriding Install Command. Keep `AZURIA_SITE_URL=https://launcher.azuriasmp.org/` in the existing environments. Redeploy and verify CSS, images, legal routes and downloads.
3. Keep `azuria-releases` as the public distribution host. The launcher workflow runs native build/release scripts from `apps/launcher` and publishes only compiled signed artifacts. Existing installed clients use the same update URL and signing key.
4. The CurseForge source path remains `services/curseforge`; its manual deployment workflow and existing secrets are unchanged. No service redeployment is necessary merely for the folder migration.
5. Rebase open PRs onto this layout, translating UI files/tests to `apps/launcher-frontend/`, native shell/installer files to `apps/launcher/`, Rust library files to `packages/azuria-*/`, and website paths to `apps/launcher-website/`. System-tray and single-instance support have been removed in a separate follow-up commit; normal idle window closure is restored.

The repository name remains `azuria-launcher` during migration. A later rename to `azuria-studios` requires checking external Git/Vercel integrations and documentation; it is not necessary for monorepo operation.

## Release boundaries

Foundation checks runs for either launcher component, the four Rust library packages, shared release tools, root workspace manifests and its workflow/routing changes. Publishing is separately gated on either launcher component or their shared build-dependency changes. Website, other apps, service, infrastructure and general documentation changes alone cannot publish a launcher release. Root lockfile changes conservatively count as launcher dependencies because all workspaces share the lockfile.

The website workflow follows its own paths and schedule, validates an artifact before publication, and retains its existing main-only publishing guard. Workspace and service checks validate routing and shared/service tests. CurseForge deployment remains an explicit manual workflow. PRs cannot publish releases or deploy the Worker.

## Adding a product

Create `apps/<product>/package.json` or `services/<service>/package.json` with a unique name and `private: true`. Use shared packages only where code is genuinely reused. Add scoped build/test commands, a path-scoped workflow and a deployment guide. Run `npm install --package-lock-only` at the root and commit the updated lockfile. Review release dependencies before adding a shared package used by the launcher to the routing rules.

Use repository/environment secrets for hosted credentials. A private repository does not protect a secret compiled into a public website or installer. Keep product deployments and runtime data separate even when source lives together.

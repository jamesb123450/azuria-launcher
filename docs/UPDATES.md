# Installed development builds

Azuria 0.2.0 includes Tauri's Rust updater. The installed app checks at startup;
Settings shows the result, release notes, download progress and **Update & restart**.
Nothing installs until you click that button. Windows closes the launcher, runs the
NSIS installer in passive mode and restarts Azuria. SQLite and instance directories
remain under the existing application identifier. The browser preview cannot update.

Downloads are verified against the public key embedded in the app before installation.
Update signing is separate from Windows Authenticode; these development installers
are still unsigned from Windows' perspective.

## One-time owner setup

The source repository is private, so Actions artifacts cannot serve as an anonymous
update feed. Create **jamesb123450/azuria-launcher-releases** as a **public** repository
and initialize it with a README. Only compiled binaries and release metadata are
published there; the source repository remains private. These binaries will be public.

In the source repository's Settings → Secrets and variables → Actions:

- Add secret `TAURI_SIGNING_PRIVATE_KEY`: the complete contents of the privately
  supplied `azuria-updater.key`. Do not paste it into an issue or commit it.
- This key has an empty password; leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unset.
- Add secret `AZURIA_RELEASE_TOKEN`: a fine-grained GitHub token restricted to the
  public releases repository, with **Contents: read and write**. Renew it before expiry.
- Add variable `AZURIA_RELEASE_BRANCH`: `feat/launcher-foundation` while developing;
  change it to `main` after merging.
- Add variable `AZURIA_AUTO_RELEASE`: `true` when ready to publish binaries publicly.

GitHub's connector cannot create the repository or set these secrets in this session.
Keep a private backup of the signing key. Future releases must use the same key;
losing it means existing installations cannot trust newly signed updates.

## Release behavior

A push to the selected branch runs frontend and Windows checks. Only after both pass,
an opted-in release job builds a signed installer with version `0.2.<workflow run number>`,
writes a `windows-x86_64` manifest, uploads installer/signature/manifest to a draft
release and publishes the complete release as latest. PR events cannot publish.
The static HTTPS feed is:

https://github.com/jamesb123450/azuria-launcher-releases/releases/latest/download/latest.json

Before the first release is published, update checks report that the feed cannot be
reached; they do not claim the installed version is current. A bootstrap 0.2.0
installer from Foundation checks can receive future signed releases. Install that
updater-enabled build once; older 0.1.0 installations do not contain an updater.

To stop publishing, set `AZURIA_AUTO_RELEASE` to `false`. Avoid overlapping releases:
the existing workflow concurrency cancels obsolete builds. Failed draft releases are
not advertised by the latest feed. The workflow run number must stay below 65536
because Windows installer versions have a bounded patch component.

## Verification

Unit tests exercise unavailable feeds, concurrent requests, download progress,
signature/download failure, and the install boundary. Windows CI compiles the native
plugin and packages the bootstrap installer. Real update installation requires two
published signed Windows versions and must be smoke-tested on Windows. No live
installation success is claimed before that test.

Official reference: https://v2.tauri.app/plugin/updater/

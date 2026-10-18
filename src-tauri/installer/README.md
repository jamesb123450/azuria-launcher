# Windows installer

Azuria uses a per-user NSIS installer with its own icon, pink/blue artwork, welcome/finish copy and an offline privacy-policy page. All actionable text, the acceptance checkbox and navigation remain native Windows controls. Bitmap text is decorative; installation does not depend on recognising it.

The installer borrows the practical pattern of native NSIS customisation used by Modrinth and the branded sidebar/header approach visible in GDLauncher’s older installer assets. No competitor artwork or installer code is included.

## Privacy acceptance

`privacy-policy.txt` is the editable launcher policy. After changing it, run:

```sh
node scripts/installer-policy.mjs
```

This generates `privacy-policy.rtf` and `privacy-version.nsh` from a canonical LF-normalised source. The SHA-256 fingerprint changes with the policy, including edits that do not change its date. Build checks reject stale generated files. The policy is bundled into the installer; network access is not required to read it.

- New installations show an unchecked **I have read and accept the Privacy Policy** box. Next is disabled until checked; Cancel is available.
- The current fingerprint is stored under `HKCU\Software\AzuriaLauncher\Privacy\AcceptedPolicy` only after successful installation. No identity, account credential or tracking identifier is recorded.
- Unchanged accepted policies can be skipped on reinstalls and unattended updates. A changed/unaccepted policy turns a `/P` update into an interactive installation; `/S` fails with exit code 2 before prerequisites or app files are installed.
- Full uninstall removes the acceptance record. Update-mode uninstall retains it so an unchanged update does not ask again.
- This is policy acknowledgement, not consent to extra analytics or a change to optional feature preferences.

The installer policy describes the launcher. Website hosting/ad disclosures remain in the separate website policy; keep the overlapping launcher descriptions consistent when features change.

## Template maintenance and checks

`installer.nsi` starts from Tauri’s `tauri-cli-v2.12.2` NSIS template:
<https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.2/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi>

The upstream template is used under its MIT option; see `UPSTREAM-LICENSE.txt`. Azuria changes are marked `AZURIA`. They add the privacy page, instantiate its functions after upstream variables are declared, and guard `.onInit`. Branding and policy logic are in `hooks.nsh`. Preserve upstream WebView2, architecture, upgrade, shortcut, data-removal and uninstaller behaviour when updating this file alongside the Tauri CLI.

Windows Foundation checks compile the real installer, then run `scripts/test-installer.ps1`. It compiles the actual privacy-page block and hooks into a harmless fixture, uses a separate test registry key and temporary marker directory, and verifies silent rejection, unchecked Next, cancellation, changed-policy acknowledgement and an accepted unattended update. Temporary state is removed afterwards.

Before distribution, also inspect the real setup wizard at 100%, 150% and 200% Windows scaling, with keyboard/Narrator and a Windows contrast theme. Local non-Windows NSIS compilation checks syntax/resources but does not establish native screen-reader behaviour. Update signatures and the application stack remain unchanged; branding is separate from Windows Authenticode signing.

Artwork derives from Azuria’s existing `public/branding/app-icon.png` and bundled Sora typeface, using charcoal, pink and blue. `sidebar.bmp` is 328×628 and `header.bmp` is 300×114 for scaling into the native wizard’s standard image regions.

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
- The Tauri updater invokes `/UPDATE` and bypasses the first-install gate entirely, regardless of policy revision or an absent acceptance record in a legacy release. `/P` remains passive and `/S` remains silent. Updates never create or overwrite an acknowledgement.
- Manual upgrades/reinstalls skip acceptance when any prior acknowledgement exists, or the registered installation still contains the launcher executable. Only a fresh installation prompts; a fresh `/S` install exits with code 2, while a fresh `/P` install becomes interactive.
- Installer and updater share Tauri’s signed NSIS payload and upstream file replacement logic, but have separate entry flows. No additional unsigned updater or download mechanism is introduced.
- Full uninstall removes the acceptance record. Update-mode uninstall retains it.
- This is policy acknowledgement, not consent to extra analytics or a change to optional feature preferences.

The installer policy describes the launcher. Website hosting/ad disclosures remain in the separate website policy; keep the overlapping launcher descriptions consistent when features change.

## Template maintenance and checks

`installer.nsi` starts from Tauri’s `tauri-cli-v2.12.2` NSIS template:
<https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.2/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi>

The upstream template is used under its MIT option; see `UPSTREAM-LICENSE.txt`. Azuria changes are marked `AZURIA`. They add the first-install privacy page, instantiate its functions after upstream variables are declared, and select installation/update handling in `.onInit`. Branding and policy logic are in `hooks.nsh`. Preserve upstream WebView2, architecture, upgrade, shortcut, data-removal and uninstaller behaviour when updating this file alongside the Tauri CLI.

Windows Foundation checks compile the real installer, then run `scripts/test-installer.ps1`. It compiles the actual privacy-page block and hooks into a harmless fixture, uses a separate test registry key and temporary marker directory, and verifies silent first-install rejection, unchecked Next, cancellation, genuine first-install acknowledgement, legacy updates without a record, changed-policy updates and manual upgrades. Temporary state is removed afterwards.

Before distribution, also inspect the real setup wizard at 100%, 150% and 200% Windows scaling, with keyboard/Narrator and a Windows contrast theme. Local non-Windows NSIS compilation checks syntax/resources but does not establish native screen-reader behaviour. Update signatures and the application stack remain unchanged; branding is separate from Windows Authenticode signing.

Artwork derives from Azuria’s existing `apps/launcher-frontend/public/branding/app-icon.png` and bundled Sora typeface, using charcoal, pink and blue. `sidebar.bmp` is 328×628 and `header.bmp` is 300×114 for scaling into the native wizard’s standard image regions.

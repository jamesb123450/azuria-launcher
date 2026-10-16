# External integration verification

Provider references and integration status. Public application identifiers may be committed; client secrets and account credentials must never be committed.

## Microsoft / Minecraft

Azuria uses its own public desktop client ID, `6979bfed-98b9-4801-8c21-f046c0ca82b3`. Owning the registration in an Entra organisation does not mean Minecraft players can use work accounts: the registration must support **personal Microsoft accounts**. The implementation uses the Microsoft `consumers` authority.

Configure **Authentication → Add a platform → Mobile and desktop applications** with `http://localhost` as a redirect URI. Azuria reserves a random loopback port before opening the browser and sends the same redirect URI when exchanging the authorization code. Use public desktop authorization code flow with PKCE; no client secret or implicit grant is needed. Permissions requested are `XboxLive.signin offline_access`.

Microsoft identity reference: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

Rust handles Microsoft, Xbox user authentication, XSTS, Minecraft login, entitlement and profile checks. The callback checks state, host, path and duplicate parameters. All network requests have timeouts and bounded response sizes. Cancellation drops the callback listener and pending network work. Only account identity, verification status and a fixed progress stage reach the webview.

Windows Credential Manager stores one refresh credential and cached account identity. Access tokens remain in native memory. Startup refresh saves rotated credentials before subsequent Minecraft verification so a later network failure does not discard them. Failed interactive account switches retain the previously saved account. A storage failure never falls back to an unencrypted file or claims sign-out succeeded. Native error messages omit raw service responses and tokens.

An Entra registration does not prove Minecraft Services access. **Live sign-in with this client ID has not been verified.** Public Q&A provides conflicting approval routing; do not present ID@Xbox as a verified self-service Minecraft launcher approval procedure or borrow another launcher’s client ID. Minecraft Services rejection is reported separately from successful Microsoft/Xbox authentication.

### Windows smoke test before release

1. Verify the Entra platform, redirect URI and personal-account support above.
2. Use the development installer from the PR’s Windows checks. Sign in with a personal account that has Minecraft Java access; confirm the correct Minecraft name and verified status.
3. Restart Azuria and check automatic reconnection. Test browser cancellation, launcher cancellation, timeout, revoked consent and loss of connectivity. A failed reconnect must show an unverified saved account.
4. Switch accounts and verify failed or cancelled switches preserve the original account. Check missing Xbox profile, family restrictions and missing Java access where test accounts are available.
5. Sign out, restart and confirm the saved account is gone. Check Windows Credential Manager access failure does not falsely report success. Do not copy tokens into bug reports.

Automated tests use fake credentials and local HTTP fixtures. They do not establish live Microsoft/Xbox/Minecraft access or validate the Windows credential store on a real machine. Game installation and launch remain separate work.

## Modrinth

API docs: https://docs.modrinth.com/api/
MRPACK: https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack

Use an identifiable User-Agent, caching/rate-limit handling and provider-returned hashes. Export references where permitted; respect content licences. No Modrinth account is required just to provide a local launcher library.

## CurseForge

Application: https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key
Author distribution control: https://support.curseforge.com/support/solutions/articles/9000207877
Download-key announcement: https://blog.curseforge.com/introducing-api-key-authentication-for-curseforge-file-downloads/

Third-party access requires approval. The June 2026 announcement specifies mandatory CDN API-key authentication from July 16. Honour third-party distribution restrictions and handle missing download URLs/401 errors. A desktop executable cannot hide a shared API key. Confirm an approved distribution arrangement before public rollout; do not introduce a hosted proxy silently into the agreed local-first architecture. Development credentials may be supplied locally later.

## Fabric and Tauri

Fabric metadata: https://wiki.fabricmc.net/documentation:modpack_related_endpoints
Tauri prerequisites: https://v2.tauri.app/start/prerequisites/
Tauri updates: https://v2.tauri.app/plugin/updater/
Windows signing: https://v2.tauri.app/distribute/sign/windows/

Signed in-app development updates are implemented; see [the setup guide](UPDATES.md) for the repository release feed and signing secret required to enable publishing. Windows executable signing is a separate later task. Do not publish unsigned foundation builds as production releases.

# External integration verification

Checked against provider documentation on 2026-10-12. No API credentials are committed.

## Microsoft / Minecraft

Plan: Azuria-owned public desktop application registration; system browser authorization code flow with PKCE and state; Rust token exchange, refresh and OS credential store; Xbox/Minecraft service chain, entitlement/profile validation. Microsoft identity documentation: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

An Entra registration does not prove Minecraft Services access. Live testing with Azuria’s own ID is required. Public Q&A provides conflicting approval routing; do not present ID@Xbox as a verified self-service Minecraft launcher approval procedure. Do not borrow another launcher’s client ID. No authentication feature is included in this milestone.

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

# Implementation plan

## Agreed scope

Azuria Launcher: public Windows-first desktop app, Minecraft Java only, Vue frontend and Rust local backend, premium dark and light pink/blue themes. Vanilla and Fabric first. Both Modrinth and CurseForge. Prepare architecture for other platforms. Do not build the custom client.

## Sequence and gates

1. Foundation: typed Vue/Tauri bridge, dark/light/system theme, navigable library/settings/roadmap, persistent instance settings, safe paths, database migration, Windows CI. Exit: validated frontend and native compile/test results.
2. Vanilla launch (browser sign-in, native verification and Windows credential storage implemented; live registration/access validation still pending): verify Azuria’s own Microsoft registration and Minecraft Services access, system browser + PKCE, OS credential storage, entitlement/profile checks, official version metadata, Java runtime compatibility, libraries/assets/natives, verified and cancellable downloads, argument generation and process monitoring. Exit: licensed account launches supported releases on real Windows.
3. Fabric: official metadata adapter, loader version selection and merged launch metadata. Exit: tested Fabric launch and compatible mod.
4. Content: separate Modrinth and CurseForge adapters, provider-aware project/file IDs, version/loader compatibility, dependency graph, required dependencies, restricted downloads, resource packs/shaders, enable/disable/remove, update previews and recovery. Exit: live provider installation tests with approved credentials.
5. Portability: MRPACK import/export, CurseForge manifest import, Azuria backup format. Validate archives and permissions; preserve user saves/configs. Exit: meaningful round-trip tests.
6. Diagnostics: streaming bounded logs, redacted export, exit codes, crash summaries, repair and interrupted-job recovery. Exit: reproducible failure recovery tests.
7. Release: installer, Windows launch matrix, documentation, licence and notices, signing, authenticated update artifacts, version migrations. Exit: clean Windows install/update/uninstall; no unresolved authentication/provider access blockers.

## First milestone details

SQLite metadata; UUID-only instance directories; serialized Rust storage access. Create/edit/favourite/remove instance; settings-copy rather than file cloning. Trash preserves removed files. No online catalogue is invented. Browser preview storage is clearly identified and separate from desktop data.

## Verification strategy

Type checking and production build. Input-validation tests. Browser flow tests for create/edit, search, favourites, settings-copy, remove, theme persistence, keyboard/modal behaviour, minimum width, dark/light layouts, and console errors. Native tests exercise actual SQLite reopen, rejection of unsafe input, directory retention and future-schema refusal. Windows CI performs native tests, Clippy, formatting and NSIS build.

## Deferred decisions

Release licence, signing identity, own Microsoft client ID/access validation, approved CurseForge desktop key distribution, runtime vendor/distribution model, release hosting, detailed Minecraft version/Windows architecture matrix. Initial Windows build target is x86_64; ARM64 requires separate verification. Do not claim universal legacy-version support.

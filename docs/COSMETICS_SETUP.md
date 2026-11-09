# Azuria cape wardrobe foundation

This first release implements the cape collection, free claims, account ownership,
selection, verified Minecraft linking and a minimal renderer lookup API. It does
not install a mod or display custom capes in Minecraft yet. The launcher labels
this clearly. Official Minecraft capes and skin controls remain independent.

There are no payments, Gem balances, prices, gifting, transfers or paid unlocks.
The original Azuria Starter atlas is free to claim. Additional capes can be granted
and revoked by an administrator; there is no public upload feature.

## Deployment

1. For a fresh Supabase project, apply `services/accounts/supabase/schema.sql` first.
   For the existing project, keep the already-applied base schema intact.
2. Review and run `services/accounts/supabase/cosmetics.sql` **once** in SQL Editor.
   This feature script is additive and transactional; it is not a reset script.
3. Deploy the verification function from the repository root:

   ```sh
   npx supabase functions deploy cosmetics-link --workdir services/accounts --project-ref YOUR_PROJECT_REF
   ```

   It uses Supabase's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` function
   environment. Neither credential is added to launcher configuration.

4. Build and distribute the launcher using the existing Azuria public URL/key.
   The wardrobe shows a recoverable setup error until the database is configured.

No production SQL or function deployment is performed by merging the source PR.

## Account and ownership boundaries

The catalogue, ownership, equipment and UUID link tables reject direct access by
ordinary users. Authenticated RPCs require a verified, unsuspended Azuria profile.
All claims, selections and unlink operations derive the owner from authentication,
never a caller-supplied Azuria account ID. One cape can be selected at a time.
Disabled capes disappear from the catalogue and public renderer lookup. Revoking
ownership removes its equipment through a foreign-key cascade.

Linking requires both a native Azuria session and the current Minecraft session.
The native command sends the Minecraft token directly to the verification function;
the webview never receives it. The function verifies it against the fixed Minecraft
Services profile endpoint, forbids redirects, and derives the UUID from that
response. Tokens are not stored, logged or returned. One Minecraft UUID belongs to
one Azuria account; an existing link cannot be silently changed. Unlink first.
Unlinking removes public display without deleting owned capes.

The linked UUID will be used publicly for cape lookup. The UI shows the UUID and
an Unlink control. Account deletion removes links, ownership and equipment.

## Administrator grants

An administrator can call `cosmetics_admin_grant(p_user, p_cape, p_owned)` through
the authenticated Supabase RPC API. This requires a live administrator session and
MFA (`aal2`), using the existing `admin_roles` checks. `true` grants ownership;
`false` revokes it. Calls are recorded in `azuria_private.cosmetic_grants` for
operator review. The general admin dashboard has no cape editor in this release.
Do not give the launcher a service-role key to perform grants.

Cape IDs and texture filenames are bounded identifiers, not remote URLs. The
launcher only displays shipped atlases from `apps/app-frontend/public/cosmetics`.
A new cape needs a reviewed 64×32 PNG atlas, a matching allowlist entry in
`capeTexture`, and a catalogue row. Capes cannot be deleted while owned; disable
one instead. Grant history is private and retained independently for auditing.

## Companion-mod contract and next phase

`POST /rest/v1/rpc/cosmetics_cape` with `{"p_uuid":"<32 lowercase hex digits>"}`
returns `{"id":"azuria-starter","texture":"azuria-starter.png"}` or `null`.
It accepts the project public API key, does not require a player session, and
exposes no Azuria account ID, email, inventory, token or grant history. A null
response means render no Azuria cape. Suspended and disabled selections return null.
Public lookup reveals that UUID's selected cape, as intended for other players.

Before shipping the companion mod:

- Choose and test explicit Minecraft/loader versions for Fabric, Quilt, Forge and
  NeoForge. Do not advertise cross-version compatibility without testing it.
- Bundle the reviewed textures and fetch only the fixed public lookup endpoint.
  Cache UUID results, bound requests/timeouts and avoid network work on the render
  thread. Offline/failure must leave Minecraft playable without a custom cape.
- Preserve official capes by default and add an explicit precedence setting.
- Make installation opt-in per compatible instance; never silently replace a mod.
- Test two real clients, suspension/unlink handling, resource reload and uninstall.

The renderer, its JAR builds and automatic launcher installation are not included
in this foundation. Cape selection here records a future preference only.

Before reconsidering commercial cosmetics, review Minecraft's current Usage
Guidelines and provider acceptance. The previous Gem/cape pricing proposal is
provisional, not an approved monetisation policy. In particular, the guidelines
restrict cape sales for servers and mods checking external ownership conditions:
https://www.minecraft.net/en-us/usage-guidelines

## Checks

`npm test` covers the wardrobe store, account switching, ownership, claiming,
equipping, linking privileges, renderer privacy, suspension, admin MFA/revocation
and account deletion. `npm run build --workspace=azuria-launcher-frontend` typechecks
and builds the UI. `deno check` and `deno test --allow-env` on the cosmetics-link
function cover identity verification, caller-supplied ID rejection and failures.
Windows CI compiles and checks native Tauri commands. The targeted Playwright
`azuria-cosmetics.spec.ts` covers wardrobe navigation and browser limitations.

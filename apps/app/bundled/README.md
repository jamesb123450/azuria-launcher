# Azuria companion mod

The launcher installs `mods/azuria-companion-mod.jar` in Azuria-enabled Fabric 1.21.1
profiles. Existing installations are migrated using the checksums of the
previously published bundled JARs. Custom profiles keep their own mods.

Build the fallback from `mods/azuria-capes` with JDK 21 and Gradle 8.12.1.
Copy `build/libs/azuria-companion-mod.jar` here before building the Windows launcher.
Launcher CI does this automatically.

## Publish a companion update

1. Bump the version in `mods/azuria-capes/build.gradle` and merge the mod change.
2. Run **Publish companion mod** on `main` in GitHub Actions.

The workflow uses the existing launcher signing credentials and publishes a
separate prerelease feed on the public releases repository. Its assets must be
mutable. The feed is independent of the latest launcher release.

Play checks the feed for up to four seconds. The launcher verifies the signature
and checks the version, Minecraft target, Fabric requirement and launcher bridge
protocol from inside the signed JAR. If the feed is unavailable or invalid, it
uses the newest verified cached or bundled JAR. The bundle is also available
during offline preparation. A launcher update is required when changing the
bridge protocol or signing key.

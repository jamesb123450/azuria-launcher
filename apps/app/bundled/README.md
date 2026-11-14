# Bundled Azuria companion mod

The Windows launcher installs the Fabric 1.21.1 companion mod when preparing
an Azuria-enabled profile. The mod retains the equipped cape renderer and adds
the in-game social overlay. Build it with JDK 21 and Gradle 8.12.1 at
`mods/azuria-capes`, then copy `build/libs/azuria-capes-0.2.1.jar` here before
building the Windows launcher. CI performs both steps.

The launcher checks the size and SHA-256 of previously shipped JARs before
removing them from managed profiles. The 0.2.0 digest was verified against the
JAR embedded in the Azuria Launcher v0.2.262 installer.

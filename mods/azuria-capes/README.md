# Azuria Capes

Client-side companion mod for **Minecraft Java 1.21.1 and Fabric Loader 0.16.14 or
later**. It displays the equipped Azuria Starter cape when the player's Minecraft
account is linked in the launcher. Each viewer installs the mod in their own
client. The server runs as usual.

## Build and try

Use JDK 21 and Gradle 8.12.1. From the repository root:

```sh
gradle -p mods/azuria-capes --no-daemon build
```

Copy `mods/azuria-capes/build/libs/azuria-capes-0.1.0.jar` into the Fabric instance's
`mods` folder. In Azuria Launcher, claim and select the starter cape, then link
your current Minecraft account. Start the instance and switch to third person.
Keep Capes enabled under Minecraft's Skin Customisation settings.

Official capes take precedence by default. To prefer your Azuria cape when one is
equipped, create `config/azuria-capes.properties` in the instance with
`preferAzuria=true`, then restart. This setting also applies when viewing other
players. Remove the JAR to uninstall.

## Lookup behaviour

The mod sends visible player UUIDs to Azuria's public cape endpoint using the
publishable project key. It fetches only the equipped cape ID and texture
filename. The starter texture is bundled. Results expire after two minutes.
Requests run off the render thread with a bounded cache, queue and response size.
If the service is unavailable, rendering falls back to Minecraft's normal cape.

To validate multiplayer, equip a cape on one linked account and view that player
from another modded client. Unequip or unlink, wait for the cache to expire, and
confirm the cape disappears. Check official cape precedence and offline launch.

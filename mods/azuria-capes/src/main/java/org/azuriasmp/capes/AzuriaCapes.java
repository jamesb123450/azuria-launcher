package org.azuriasmp.capes;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.util.Identifier;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Properties;
import java.util.UUID;

public final class AzuriaCapes implements ClientModInitializer {
    private static final Identifier STARTER = Identifier.of("azuria_capes", "textures/azuria-starter.png");
    private static final CapeLookup LOOKUP = new CapeLookup();
    private static boolean preferAzuria;

    @Override
    public void onInitializeClient() {
        var path = FabricLoader.getInstance().getConfigDir().resolve("azuria-capes.properties");
        if (Files.isRegularFile(path)) {
            try (var reader = Files.newBufferedReader(path)) {
                var settings = new Properties();
                settings.load(reader);
                preferAzuria = Boolean.parseBoolean(settings.getProperty("preferAzuria"));
            } catch (IOException | IllegalArgumentException ignored) {
                // A broken optional configuration falls back to official cape precedence.
            }
        }
    }

    public static Identifier cape(UUID player, Identifier official) {
        if (official != null && !preferAzuria) return official;
        return LOOKUP.hasStarter(player) ? STARTER : official;
    }
}

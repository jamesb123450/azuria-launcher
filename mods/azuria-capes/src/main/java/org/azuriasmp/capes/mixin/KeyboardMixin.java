package org.azuriasmp.capes.mixin;

import net.minecraft.client.Keyboard;
import net.minecraft.client.MinecraftClient;
import org.azuriasmp.capes.SocialScreen;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Keyboard.class)
public abstract class KeyboardMixin {
    @Shadow @Final private MinecraftClient client;

    @Inject(method = "onKey", at = @At("HEAD"), cancellable = true)
    private void azuriaOverlay(long window, int key, int scan, int action, int modifiers, CallbackInfo ci) {
        if (window != client.getWindow().getHandle() || key != GLFW.GLFW_KEY_TAB
            || action != GLFW.GLFW_PRESS || (modifiers & GLFW.GLFW_MOD_SHIFT) == 0) return;
        if (client.currentScreen instanceof SocialScreen) {
            client.setScreen(null);
        } else if (client.currentScreen == null && client.player != null) {
            client.setScreen(new SocialScreen());
        } else {
            return;
        }
        ci.cancel();
    }
}

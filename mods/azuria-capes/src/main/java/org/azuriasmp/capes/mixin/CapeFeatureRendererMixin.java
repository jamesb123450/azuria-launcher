package org.azuriasmp.capes.mixin;

import net.minecraft.client.network.AbstractClientPlayerEntity;
import net.minecraft.client.render.entity.feature.CapeFeatureRenderer;
import net.minecraft.client.util.SkinTextures;
import org.azuriasmp.capes.AzuriaCapes;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

@Mixin(CapeFeatureRenderer.class)
abstract class CapeFeatureRendererMixin {
    @Redirect(
        method = "render(Lnet/minecraft/client/util/math/MatrixStack;Lnet/minecraft/client/render/VertexConsumerProvider;ILnet/minecraft/client/network/AbstractClientPlayerEntity;FFFFFF)V",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/client/network/AbstractClientPlayerEntity;getSkinTextures()Lnet/minecraft/client/util/SkinTextures;")
    )
    private SkinTextures azuriaCapeTextures(AbstractClientPlayerEntity player) {
        SkinTextures original = player.getSkinTextures();
        var cape = AzuriaCapes.cape(player.getUuid(), original.capeTexture());
        if (cape == original.capeTexture()) return original;
        return new SkinTextures(original.texture(), original.textureUrl(), cape,
            original.elytraTexture(), original.model(), original.secure());
    }
}

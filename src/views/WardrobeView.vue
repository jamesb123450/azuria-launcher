<script setup lang="ts">
import { computed, ref } from "vue";
import { useAccount } from "../stores/account";
import { useWardrobe } from "../stores/wardrobe";
import CapePreview from "../components/CapePreview.vue";
import SkinPreview from "../components/SkinPreview.vue";
import SkinHead from "../components/SkinHead.vue";
import VersionPicker from "../components/VersionPicker.vue";
import { desktop } from "../api";
const account = useAccount();
const wardrobe = useWardrobe();
const model = ref("classic");
const id = computed(() => account.view.account?.minecraftId ?? "");
const change = (action: string, cape?: string) =>
  wardrobe.change(action, id.value, cape);
</script>
<template>
  <section class="page-heading">
    <div>
      <h1>Skins & capes</h1>
      <p class="muted">Your Minecraft identity, everywhere you play.</p>
    </div>
    <button
      class="button secondary"
      :disabled="wardrobe.busy || !id || !desktop"
      @click="wardrobe.load(id)"
    >
      Refresh
    </button>
  </section>
  <section class="settings-panel">
    <div class="wardrobe-identity">
      <span class="wardrobe-head"><SkinHead /></span>
      <div>
        <h2>{{ account.label }}</h2>
        <p class="muted">
          Changes apply to your Minecraft account. Rejoin a server or relaunch
          to see them in game.
        </p>
      </div>
    </div>
    <p v-if="!desktop" class="muted">
      Manage skins and capes in the Windows desktop app.
    </p>
    <p v-else-if="!account.view.verified" class="muted">
      Connect your Minecraft Java account in Settings to manage its appearance.
    </p>
    <template v-else
      ><p v-if="wardrobe.error" class="inline-error" role="alert">
        {{ wardrobe.error }}
      </p>
      <p v-if="wardrobe.busy" role="status" class="muted">
        Updating your wardrobe…
      </p>
      <div class="wardrobe-layout">
        <section>
          <h2>Skin</h2>
          <div class="skin-texture">
            <SkinPreview
              v-if="wardrobe.profile?.skin"
              :skin="wardrobe.profile?.skin ?? null"
              :variant="wardrobe.profile?.variant ?? 'classic'"
            />
            <span v-if="!wardrobe.profile?.skin" class="muted"
              >Default Minecraft appearance</span
            >
          </div>
          <VersionPicker
            v-model="model"
            label="Skin model"
            :options="[
              { value: 'classic', label: 'Classic · wide arms' },
              { value: 'slim', label: 'Slim · narrow arms' },
            ]"
          />
          <p class="muted">
            PNG skins, 64 × 64 or 64 × 32 pixels. Classic is recommended for
            legacy skins.
          </p>
          <div class="update-actions">
            <button
              class="button primary"
              :disabled="wardrobe.busy"
              @click="change(model === 'slim' ? 'uploadSlim' : 'uploadClassic')"
            >
              Upload skin</button
            ><button
              class="button secondary"
              :disabled="wardrobe.busy || !wardrobe.profile"
              @click="change('resetSkin')"
            >
              Reset skin
            </button>
          </div>
        </section>
        <section>
          <h2>Capes</h2>
          <p class="muted">Choose from capes owned by this account.</p>
          <div class="cape-grid">
            <button
              class="cape-card"
              :aria-pressed="!wardrobe.profile?.capes.some((c) => c.active)"
              :disabled="wardrobe.busy || !wardrobe.profile"
              @click="change('hideCape')"
            >
              <span class="no-cape">∅</span><strong>No cape</strong></button
            ><button
              v-for="cape in wardrobe.profile?.capes"
              :key="cape.id"
              class="cape-card"
              :aria-pressed="cape.active"
              :disabled="wardrobe.busy"
              @click="change('selectCape', cape.id)"
            >
              <CapePreview :image="cape.image" :name="cape.alias" /><strong>{{
                cape.alias
              }}</strong
              ><span v-if="cape.active">Equipped</span>
            </button>
          </div>
          <p
            v-if="wardrobe.profile && !wardrobe.profile.capes.length"
            class="muted"
          >
            This account has no capes available.
          </p>
        </section>
      </div></template
    >
  </section>
</template>
<style scoped>
.wardrobe-identity {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 28px;
}
.wardrobe-head {
  width: 64px;
  height: 64px;
  flex: none;
}
.wardrobe-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 36px;
}
.wardrobe-layout h2 {
  font-size: 18px;
}
.wardrobe-layout p {
  font-size: 12px;
  line-height: 1.7;
}
.skin-texture {
  height: 190px;
  display: grid;
  place-items: center;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  margin: 18px 0;
}
.skin-texture img {
  height: 150px;
  max-width: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.cape-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.cape-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  min-height: 145px;
}
.cape-card[aria-pressed="true"] {
  border-color: var(--pink);
  background: var(--accent-wash);
}
.cape-card strong {
  font-size: 12px;
}
.cape-card span {
  font-size: 10px;
  color: var(--muted);
}
.cape-card .no-cape {
  font-size: 46px;
}
@media (max-width: 1000px) {
  .wardrobe-layout {
    gap: 22px;
  }
}
</style>

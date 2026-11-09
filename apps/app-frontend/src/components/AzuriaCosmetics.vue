<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { useAzuriaAccount } from "../stores/azuria-account";
import { useAccount } from "../stores/account";
import { useAzuriaCosmetics, capeTexture } from "../stores/azuria-cosmetics";
import CapePreview from "./CapePreview.vue";
import { desktop } from "../api";
const props = defineProps<{ inventory: boolean }>();
const account = useAzuriaAccount(),
  minecraft = useAccount(),
  cosmetics = useAzuriaCosmetics();
const capes = computed(
  () =>
    cosmetics.snapshot?.capes.filter((c) => !props.inventory || c.owned) ?? [],
);
watch(
  () => cosmetics.owner,
  () => {
    void cosmetics.request();
  },
);
onMounted(async () => {
  await account.init();
  if (!cosmetics.snapshot) await cosmetics.request();
});
</script>
<template>
  <section class="azuria-cosmetics" aria-label="Azuria capes">
    <header>
      <div>
        <h2>
          {{ inventory ? "Your Azuria capes" : "Azuria cape collection" }}
        </h2>
        <p>
          Custom Azuria capes are separate from your official Minecraft capes.
        </p>
      </div>
      <button
        class="button"
        :disabled="!desktop || !cosmetics.owner || cosmetics.busy"
        @click="cosmetics.request()"
      >
        Refresh
      </button>
    </header>
    <p class="muted">
      This first release saves your collection and selected cape. In-game
      display is not available until the companion mod is released.
    </p>
    <p v-if="!desktop" class="muted">
      Open the installed launcher to manage your Azuria capes.
    </p>
    <div v-else-if="!cosmetics.owner" class="cosmetics-empty">
      <p>Sign in to your Azuria account to claim and manage capes.</p>
      <button
        class="button primary"
        :disabled="account.busy"
        @click="account.begin()"
      >
        Sign in to Azuria
      </button>
    </div>
    <template v-else>
      <div class="cosmetics-link">
        <span v-if="cosmetics.snapshot?.minecraftUuid"
          >Linked Minecraft UUID:
          <code>{{ cosmetics.snapshot.minecraftUuid }}</code></span
        ><span v-else
          >Link your Minecraft account to prepare your cape for in-game
          use.</span
        ><button
          v-if="cosmetics.snapshot?.minecraftUuid"
          class="button"
          :disabled="cosmetics.busy"
          @click="cosmetics.request('unlink')"
        >
          Unlink Minecraft</button
        ><button
          v-else
          class="button"
          :disabled="cosmetics.busy || !minecraft.view.verified"
          @click="
            cosmetics.request(
              'link',
              undefined,
              minecraft.view.account?.minecraftId,
            )
          "
        >
          Link current Minecraft account
        </button>
      </div>
      <p v-if="!minecraft.view.verified" class="muted">
        Sign in to Minecraft before linking. Your collection belongs to your
        Azuria account.
      </p>
      <p v-if="cosmetics.busy" role="status">Updating wardrobe…</p>
      <p v-if="cosmetics.error" role="alert" class="inline-error">
        {{ cosmetics.error }}
      </p>
      <p v-if="cosmetics.notice" role="status">{{ cosmetics.notice }}</p>
      <div class="cosmetics-grid">
        <article v-for="cape in capes" :key="cape.id" class="cosmetics-card">
          <CapePreview :image="capeTexture(cape.texture)" :name="cape.name" />
          <h3>{{ cape.name }}</h3>
          <p>{{ cape.description }}</p>
          <strong v-if="cosmetics.snapshot?.equipped === cape.id"
            >Selected</strong
          ><span v-else-if="cape.owned">Owned</span
          ><span v-else-if="cape.claimable">Free</span
          ><span v-else>Granted by Azuria</span
          ><button
            v-if="!cape.owned && cape.claimable"
            class="button primary"
            :disabled="cosmetics.busy"
            @click="cosmetics.request('claim', cape.id)"
          >
            Claim cape</button
          ><button
            v-else-if="cape.owned && cosmetics.snapshot?.equipped !== cape.id"
            class="button primary"
            :disabled="cosmetics.busy"
            @click="cosmetics.request('equip', cape.id)"
          >
            Select cape</button
          ><button
            v-else-if="cosmetics.snapshot?.equipped === cape.id"
            class="button"
            :disabled="cosmetics.busy"
            @click="cosmetics.request('unequip')"
          >
            Unequip
          </button>
        </article>
      </div>
      <p
        v-if="cosmetics.snapshot && !capes.length && !cosmetics.busy"
        class="cosmetics-empty"
      >
        No capes in your inventory yet. Open Registry to claim the free starter
        cape.
      </p>
    </template>
  </section>
</template>
<style scoped>
.azuria-cosmetics {
  padding: 24px;
  display: grid;
  gap: 16px;
  min-width: 0;
}
.azuria-cosmetics header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.azuria-cosmetics h2,
.azuria-cosmetics h3 {
  margin: 0 0 8px;
}
.azuria-cosmetics p {
  margin: 0;
  line-height: 1.55;
}
.cosmetics-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border, #363442);
  border-radius: 12px;
}
.cosmetics-link code {
  overflow-wrap: anywhere;
}
.cosmetics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}
.cosmetics-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 24px 18px;
  border: 1px solid var(--border, #363442);
  border-radius: 16px;
  background: var(--surface, #1b1c27);
}
.cosmetics-card .button {
  margin-top: auto;
}
.cosmetics-empty {
  padding: 24px;
  text-align: center;
  display: grid;
  gap: 16px;
  justify-items: center;
}
</style>

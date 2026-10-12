<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { X, Box, Layers3 } from '@lucide/vue'
import type { Instance } from '../types'
import { DEFAULT_INPUT, validateInput } from '../types'
import { useLauncher } from '../stores/launcher'
const props = defineProps<{ instance?: Instance; duplicate?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useLauncher(); const dialog = ref<HTMLDialogElement>(); const nameInput = ref<HTMLInputElement>(); const error = ref('')
const form = reactive({ ...DEFAULT_INPUT, ...(props.instance ?? {}), name: props.duplicate ? `${props.instance?.name ?? ''} copy` : (props.instance?.name ?? '') })
const edit = Boolean(props.instance && !props.duplicate)
let previousFocus: HTMLElement | null = null
onMounted(async () => { previousFocus = document.activeElement as HTMLElement; dialog.value?.showModal(); await nextTick(); nameInput.value?.focus() })
onBeforeUnmount(() => { dialog.value?.close(); previousFocus?.focus() })
async function save() { error.value = validateInput(form) ?? ''; if (error.value) return; const result = await store.save({ name: form.name, minecraftVersion: form.minecraftVersion, loader: form.loader, memoryMb: Number(form.memoryMb) }, edit ? props.instance?.id : undefined); if (result) emit('close') }
</script>
<template>
<dialog ref="dialog" class="instance-dialog" aria-labelledby="dialog-title" @cancel.prevent="!store.busy && emit('close')">
  <form @submit.prevent="save">
    <div class="dialog-heading"><div><span class="eyebrow">YOUR WORLD, YOUR RULES</span><h2 id="dialog-title">{{ edit ? 'Edit instance' : duplicate ? 'Copy instance settings' : 'Create an instance' }}</h2></div><button type="button" class="icon-button" aria-label="Close dialog" :disabled="store.busy" @click="emit('close')"><X :size="20"/></button></div>
    <p class="muted">{{ duplicate ? 'Creates a fresh instance with these settings. Worlds and files are not copied.' : 'Give your next adventure a home. Installation comes in the next milestone.' }}</p>
    <label class="field">Instance name<input ref="nameInput" v-model="form.name" required maxlength="80" placeholder="e.g. A little adventure"/></label>
    <label class="field">Minecraft version<input v-model="form.minecraftVersion" required maxlength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}" placeholder="e.g. 1.21.1"/><small>Enter an exact version ID. Availability will be checked when game installation is added.</small></label>
    <fieldset class="loader-field"><legend>Mod loader</legend><label :class="['loader-option', { active: form.loader === 'vanilla' }]"><input v-model="form.loader" type="radio" value="vanilla"/><Box :size="20"/><span>Vanilla<small>The original experience</small></span></label><label :class="['loader-option', { active: form.loader === 'fabric' }]"><input v-model="form.loader" type="radio" value="fabric"/><Layers3 :size="20"/><span>Fabric<small>A home for your mods</small></span></label></fieldset>
    <label class="field">Memory allocation <span class="memory-value">{{ (form.memoryMb / 1024).toFixed(2) }} GB</span><input v-model.number="form.memoryMb" type="range" min="512" max="16384" step="256"/><small>Choose an amount suitable for your computer. Applied when launching is available.</small></label>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p><p v-if="store.error" class="inline-error" role="alert">{{ store.error }}</p>
    <div class="dialog-actions"><button type="button" class="button secondary" :disabled="store.busy" @click="emit('close')">Cancel</button><button class="button primary" :disabled="store.busy">{{ store.busy ? 'Saving…' : edit ? 'Save changes' : 'Create instance' }}</button></div>
  </form>
</dialog>
</template>

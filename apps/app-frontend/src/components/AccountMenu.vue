<script setup lang="ts">
import {
  computed,
  ref,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  UserRound,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  UsersRound,
  Shirt,
  Camera,
  Settings,
  LogOut,
  Check,
  LoaderCircle,
} from "@lucide/vue";
import SkinHead from "./SkinHead.vue";
import { useAccount } from "../stores/account";
const props = defineProps<{ hero?: boolean }>();
const menuId = computed(() =>
  props.hero ? "minecraft-account-menu-hero" : "minecraft-account-menu",
);
const account = useAccount(),
  route = useRoute(),
  router = useRouter();
const open = ref(false),
  switching = ref(false),
  host = ref<HTMLElement>(),
  trigger = ref<HTMLButtonElement>(),
  panel = ref<HTMLElement>(),
  switchButton = ref<HTMLButtonElement>(),
  submenu = ref<HTMLElement>();
function close(focus = false) {
  open.value = false;
  switching.value = false;
  if (focus) trigger.value?.focus();
}
async function toggle() {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  await nextTick();
  panel.value
    ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
    ?.focus();
}
async function showSwitch() {
  switching.value = !switching.value;
  if (switching.value) {
    await nextTick();
    submenu.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }
}
function navigate(path: string) {
  close();
  void router.push(path);
}
async function action(kind: "signIn" | "restore" | "signOut") {
  await account[kind]();
  if (!account.error) close(true);
}
function outside(event: PointerEvent) {
  if (!host.value?.contains(event.target as Node)) close();
}
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (switching.value) {
      switching.value = false;
      switchButton.value?.focus();
    } else close(true);
    return;
  }
  if (event.key === "Tab") return;
  if (event.key === "ArrowLeft" && switching.value) {
    event.preventDefault();
    switching.value = false;
    switchButton.value?.focus();
    return;
  }
  const root = switching.value ? submenu.value : panel.value;
  const items = [
    ...(root?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    ) ?? []),
  ].filter((el) => el.closest('[role="menu"]') === root);
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
    !items.length
  )
    return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  items[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length
  ]?.focus();
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
watch(
  () => route.fullPath,
  () => close(),
);
</script>
<template>
  <div
    ref="host"
    class="account-menu"
    @keydown="keyboard"
    @focusout="
      (event) => {
        if (!host?.contains(event.relatedTarget as Node)) close();
      }
    "
  >
    <button
      ref="trigger"
      :class="[
        'topbar-account',
        { 'needs-auth': account.view.account && !account.view.verified },
      ]"
      :aria-label="
        hero
          ? 'Player scene account options'
          : account.view.account
            ? 'Manage Minecraft account'
            : 'Sign in to Minecraft'
      "
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="toggle"
      @keydown.down.prevent="!open && toggle()"
    >
      <SkinHead v-if="account.view.account" /><UserRound
        v-else
        :size="16"
      /><span>{{ account.view.account ? account.label : "Sign in" }}</span
      ><LoaderCircle
        v-if="account.busy"
        :size="13"
        class="launch-spin"
      /><ChevronDown
        v-else
        :size="13"
        :class="{ 'account-chevron-open': open }"
      />
    </button>
    <Transition name="account-drop"
      ><div
        v-if="open"
        :id="menuId"
        ref="panel"
        class="account-dropdown"
        role="menu"
        aria-label="Minecraft account actions"
      >
        <div class="account-dropdown-identity">
          <SkinHead />
          <div>
            <strong>{{ account.label }}</strong
            ><span>MINECRAFT ACCOUNT</span>
          </div>
          <Check v-if="account.view.verified" :size="15" />
        </div>
        <button
          v-if="!account.view.verified"
          role="menuitem"
          tabindex="-1"
          class="account-reauth"
          :disabled="account.busy || !account.view.supported"
          @click="action(account.view.hasSavedSession ? 'restore' : 'signIn')"
        >
          <RefreshCw :size="16" />{{
            account.view.hasSavedSession
              ? "Reauthenticate now"
              : "Sign in with Microsoft"
          }}
        </button>
        <button
          v-if="account.view.account"
          ref="switchButton"
          role="menuitem"
          tabindex="-1"
          aria-haspopup="menu"
          :aria-expanded="switching"
          aria-controls="minecraft-switch-menu"
          :disabled="account.busy"
          @click="showSwitch"
          @keydown.right.prevent="!switching && showSwitch()"
        >
          <UsersRound :size="16" />Switch account<ChevronRight
            :size="14"
            class="account-menu-end"
          />
        </button>
        <Transition name="account-drop"
          ><div
            v-if="switching"
            id="minecraft-switch-menu"
            ref="submenu"
            role="menu"
            aria-label="Switch Minecraft account"
            class="account-switch-menu"
          >
            <p>Use another Minecraft account</p>
            <button
              role="menuitem"
              tabindex="-1"
              :disabled="account.busy || !account.view.supported"
              @click="action('signIn')"
            >
              <UserRound :size="16" />Sign in with Microsoft</button
            ><small>This replaces the account saved on this device.</small>
          </div></Transition
        >
        <button role="menuitem" tabindex="-1" @click="navigate('/wardrobe')">
          <Shirt :size="16" />Change skin / cape
        </button>
        <button role="menuitem" tabindex="-1" @click="navigate('/screenshots')">
          <Camera :size="16" />Screenshots
        </button>
        <button
          role="menuitem"
          tabindex="-1"
          @click="navigate('/settings#account')"
        >
          <Settings :size="16" />Account settings
        </button>
        <div class="account-menu-divider" />
        <button
          v-if="account.view.account || account.view.hasSavedSession"
          role="menuitem"
          tabindex="-1"
          class="account-signout"
          :disabled="account.busy"
          @click="action('signOut')"
        >
          <LogOut :size="16" />Sign out
        </button>
        <button
          v-if="account.busy && account.stage !== 'storage'"
          role="menuitem"
          tabindex="-1"
          :disabled="account.cancelling"
          @click="account.cancel"
        >
          Cancel sign-in
        </button>
        <p v-if="account.busy" role="status" class="account-menu-status">
          Finish signing in in your browser…
        </p>
        <p v-if="account.error" role="alert" class="account-menu-error">
          {{ account.error }}
        </p>
      </div></Transition
    >
  </div>
</template>
<style scoped>
.account-menu {
  position: relative;
  -webkit-app-region: no-drag;
}
.account-menu .topbar-account {
  font: inherit;
  color: var(--text);
  cursor: pointer;
  gap: 7px;
  border: 1px solid var(--border-strong);
  transition:
    background 0.2s,
    border-color 0.2s;
}
.topbar-account > svg:last-child {
  transition: transform 0.22s;
}
.account-chevron-open {
  transform: rotate(180deg);
}
.account-menu .needs-auth {
  border-color: #db967855;
  background: #d1846b14;
}
.account-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 12px);
  width: 248px;
  padding: 7px;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  box-shadow: 0 18px 50px #0005;
  z-index: 120;
  transform-origin: top right;
}
.account-dropdown button {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 39px;
  width: 100%;
  padding: 9px 11px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.17s,
    color 0.17s;
}
.account-dropdown button:hover,
.account-dropdown button:focus-visible {
  background: var(--hover);
  outline: none;
}
.account-dropdown button:focus-visible {
  box-shadow: inset 0 0 0 1px var(--pink);
}
.account-dropdown button:disabled {
  opacity: 0.45;
  cursor: default;
}
.account-menu-end {
  margin-left: auto;
}
.account-dropdown-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 10px 14px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 5px;
}
.account-dropdown-identity > .skin-head {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.account-dropdown-identity > div {
  display: grid;
  gap: 5px;
  min-width: 0;
  flex: 1;
}
.account-dropdown-identity strong {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-dropdown-identity span {
  font-size: 8px;
  letter-spacing: 0.13em;
  color: var(--muted);
}
.account-dropdown-identity > svg {
  color: var(--pink);
}
.account-dropdown .account-reauth {
  color: #e6aa91;
}
.account-menu-divider {
  height: 1px;
  background: var(--border);
  margin: 5px 7px;
}
.account-dropdown .account-signout {
  color: var(--muted);
}
.account-switch-menu {
  padding: 8px;
  margin: 4px 6px 7px;
  background: var(--panel-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.account-switch-menu p,
.account-switch-menu small {
  display: block;
  font-size: 10px;
  color: var(--muted);
  line-height: 1.6;
  padding: 0 4px;
  margin: 4px 0;
}
.account-menu-status,
.account-menu-error {
  font-size: 11px;
  line-height: 1.6;
  margin: 8px;
  padding: 4px;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.account-menu-error {
  color: var(--error, #e6aa91);
}
.account-drop-enter-active,
.account-drop-leave-active {
  transition:
    opacity 0.18s,
    transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.account-drop-enter-from,
.account-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .account-drop-enter-active,
  .account-drop-leave-active,
  .account-menu .topbar-account,
  .topbar-account > svg:last-child {
    transition: none;
  }
}
:global(html[data-theme="light"] .account-reauth) {
  color: #a34026;
}
:global(html[data-theme="light"] .account-menu-error) {
  color: #a1324a;
}
</style>

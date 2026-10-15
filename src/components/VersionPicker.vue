<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
} from "vue";
import { Check, ChevronDown, Eye } from "@lucide/vue";
export interface VersionOption {
  value: string;
  label: string;
  detail?: string;
}
const props = defineProps<{
  modelValue: string;
  options: VersionOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  showAll?: boolean;
  allLabel?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "toggle-all": [];
}>();
const id = useId();
const listId = `versions-${id}`;
const trigger = ref<HTMLButtonElement>();
const popup = ref<HTMLElement>();
const opened = ref(false);
const cursor = ref(0);
const position = ref<Record<string, string>>({});
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const activeId = computed(() =>
  opened.value && props.options[cursor.value]
    ? `${listId}-${cursor.value}`
    : undefined,
);
function place() {
  const bounds = trigger.value?.getBoundingClientRect();
  if (!bounds) return;
  const below = window.innerHeight - bounds.bottom - 14;
  const above = bounds.top - 14;
  const upward = below < 220 && above > below;
  const height = Math.min(350, upward ? above : below);
  position.value = {
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    maxHeight: `${height}px`,
    ...(upward
      ? { bottom: `${window.innerHeight - bounds.top + 6}px` }
      : { top: `${bounds.bottom + 6}px` }),
  };
}
async function reveal() {
  if (props.disabled || opened.value) return;
  place();
  cursor.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  );
  popup.value?.showPopover();
  opened.value = true;
  await nextTick();
  scrollActive();
}
function close() {
  popup.value?.hidePopover();
  opened.value = false;
}
function scrollActive() {
  void nextTick(() =>
    document
      .getElementById(activeId.value ?? "")
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function choose(value: string) {
  emit("update:modelValue", value);
  close();
  trigger.value?.focus();
}
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape" && opened.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === "Tab") {
    close();
    return;
  }
  if (
    !["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)
  )
    return;
  event.preventDefault();
  if (!opened.value) {
    void reveal();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    const option = props.options[cursor.value];
    if (option) choose(option.value);
    return;
  }
  if (event.key === "Home") cursor.value = 0;
  else if (event.key === "End")
    cursor.value = Math.max(0, props.options.length - 1);
  else
    cursor.value = Math.max(
      0,
      Math.min(
        props.options.length - 1,
        cursor.value + (event.key === "ArrowDown" ? 1 : -1),
      ),
    );
  scrollActive();
}
async function toggleAll() {
  emit("toggle-all");
  await nextTick();
  cursor.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  );
  place();
  scrollActive();
}
function viewportChanged(event: Event) {
  if (
    opened.value &&
    !(event.target instanceof Node && popup.value?.contains(event.target))
  )
    close();
}
onMounted(() => {
  window.addEventListener("resize", viewportChanged);
  window.addEventListener("scroll", viewportChanged, true);
});
onBeforeUnmount(() => {
  close();
  window.removeEventListener("resize", viewportChanged);
  window.removeEventListener("scroll", viewportChanged, true);
});
</script>
<template>
  <div class="version-picker">
    <button
      ref="trigger"
      type="button"
      class="version-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-expanded="opened"
      :aria-controls="listId"
      :aria-activedescendant="activeId"
      :disabled="disabled"
      @click="opened ? close() : reveal()"
      @keydown="keyboard"
    >
      <span>{{
        selected?.label ?? (modelValue || placeholder || "Select a version")
      }}</span>
      <ChevronDown :size="16" :class="{ flipped: opened }" />
    </button>
    <div
      ref="popup"
      popover="auto"
      class="version-popup"
      :style="position"
      @toggle="opened = ($event as ToggleEvent).newState === 'open'"
      @keydown.esc.stop.prevent="
        close();
        trigger?.focus();
      "
    >
      <div
        :id="listId"
        role="listbox"
        :aria-label="label"
        class="version-options"
      >
        <button
          v-for="(option, index) in options"
          :id="`${listId}-${index}`"
          :key="option.value"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="modelValue === option.value"
          :class="[
            'version-option',
            { current: modelValue === option.value, cursor: index === cursor },
          ]"
          @pointermove="cursor = index"
          @click="choose(option.value)"
        >
          <span
            >{{ option.label
            }}<small v-if="option.detail">{{ option.detail }}</small></span
          >
          <Check v-if="modelValue === option.value" :size="15" />
        </button>
        <p v-if="!options.length" class="version-empty">
          No versions available.
        </p>
      </div>
      <button
        v-if="allLabel"
        type="button"
        class="version-show-all"
        :aria-pressed="showAll"
        @click="toggleAll"
      >
        <Eye :size="15" />{{ showAll ? "Show stable versions" : allLabel }}
      </button>
    </div>
  </div>
</template>
<style>
.version-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  background: var(--input);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.version-trigger > svg {
  flex-shrink: 0;
  color: var(--muted);
}
.version-trigger[aria-expanded="true"] {
  border-color: var(--blue);
}
.version-popup {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--text);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.version-popup:popover-open {
  display: flex;
  flex-direction: column;
}
.version-options {
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
  padding: 4px 0;
}
.version-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: none;
  border: 0;
  color: var(--muted);
  padding: 13px 16px;
  width: 100%;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}
.version-option small {
  margin-left: 10px;
  color: var(--subtle);
  font-size: 10px;
}
.version-option.current {
  color: var(--blue);
  background: color-mix(in srgb, var(--blue) 17%, var(--panel-soft));
}
.version-option.cursor:not(.current),
.version-option:hover:not(.current) {
  background: var(--hover);
  color: var(--text);
}
.version-show-all {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  border: 0;
  border-top: 1px solid var(--border-strong);
  padding: 12px;
  font-size: 11px;
  color: var(--muted);
  background: var(--panel-soft);
  cursor: pointer;
}
.version-show-all:hover {
  color: var(--blue);
}
.version-empty {
  color: var(--muted);
  font-size: 12px;
  padding: 12px 16px;
}
</style>

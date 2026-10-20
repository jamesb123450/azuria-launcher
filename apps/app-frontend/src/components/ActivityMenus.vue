<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import {
  Bell,
  Download,
  X,
  Trash2,
  Check,
  Package,
  LoaderCircle,
} from "@lucide/vue";
import { useActivity, type Task } from "../stores/activity";
import { useGame } from "../stores/game";
import { useContent } from "../stores/content";
import { useUpdates } from "../stores/updates";
const activity = useActivity(),
  game = useGame(),
  content = useContent(),
  updates = useUpdates();
activity.init();
const open = ref<"tasks" | "notifications" | null>(null),
  host = ref<HTMLElement>(),
  notificationsButton = ref<HTMLButtonElement>(),
  tasksButton = ref<HTMLButtonElement>(),
  panel = ref<HTMLElement>();
async function toggle(menu: "tasks" | "notifications") {
  open.value = open.value === menu ? null : menu;
  if (menu === "notifications") activity.markRead();
  if (open.value) {
    await nextTick();
    panel.value?.focus();
  }
}
function close() {
  const previous = open.value;
  open.value = null;
  (previous === "tasks"
    ? tasksButton.value
    : notificationsButton.value
  )?.focus();
}
function outside(e: PointerEvent) {
  if (!host.value?.contains(e.target as Node)) open.value = null;
}
document.addEventListener("pointerdown", outside);
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
function cancellable(task: Task) {
  return (
    task.kind === "game" ||
    (task.kind === "content" && task.stage !== "installing")
  );
}
async function cancel(task: Task) {
  if (task.kind === "game" && task.instance) await game.cancel(task.instance);
  else if (task.kind === "content") await content.cancel();
}
</script>
<template>
  <div ref="host" class="activity-menus" @keydown.esc.stop.prevent="close">
    <button
      ref="notificationsButton"
      class="topbar-icon"
      aria-label="Notifications"
      :aria-expanded="open === 'notifications'"
      aria-controls="notifications-panel"
      @click="toggle('notifications')"
    >
      <Bell :size="16" /><i v-if="activity.unread" class="activity-dot" />
    </button>
    <button
      ref="tasksButton"
      class="topbar-icon"
      aria-label="Downloads and tasks"
      :aria-expanded="open === 'tasks'"
      aria-controls="tasks-panel"
      @click="toggle('tasks')"
    >
      <LoaderCircle
        v-if="activity.active.length"
        :size="16"
        class="launch-spin"
      /><Download v-else :size="16" /><span
        v-if="activity.active.length"
        class="activity-count"
        >{{ activity.active.length }}</span
      >
    </button>
    <section
      v-if="open"
      :id="open === 'tasks' ? 'tasks-panel' : 'notifications-panel'"
      ref="panel"
      class="activity-popover"
      role="region"
      :aria-label="open === 'tasks' ? 'Tasks' : 'Notifications'"
      tabindex="-1"
    >
      <header>
        <h2>
          {{ open === "tasks" ? "Tasks" : "Notifications"
          }}<span v-if="open === 'tasks' && activity.active.length">{{
            activity.active.length
          }}</span>
        </h2>
        <button
          class="icon-button"
          aria-label="Close activity panel"
          @click="close"
        >
          <X :size="16" />
        </button>
      </header>
      <template v-if="open === 'tasks'">
        <div v-if="!activity.tasks.length" class="activity-empty">
          <Download :size="26" />
          <h3>No tasks yet</h3>
          <p>Downloads and installations will appear here.</p>
        </div>
        <section v-if="activity.active.length" class="task-section">
          <h3>Active</h3>
          <article
            v-for="task in activity.active"
            :key="task.key"
            class="task-item"
          >
            <Package :size="24" />
            <div>
              <strong>{{ task.name }}</strong>
              <p>{{ task.message }}</p>
              <progress
                :value="task.progress"
                max="100"
                :aria-label="`${task.name} progress`"
              />
            </div>
            <button
              v-if="cancellable(task)"
              class="icon-button"
              :aria-label="`Cancel ${task.name}`"
              :disabled="!!task.instance && !!game.stopping[task.instance]"
              @click="cancel(task)"
            >
              <X :size="15" />
            </button>
          </article>
        </section>
        <section v-if="activity.finished.length" class="task-section">
          <div class="task-section-title">
            <h3>Complete</h3>
            <button class="text-link" @click="activity.clearFinished">
              Clear all
            </button>
          </div>
          <article
            v-for="task in activity.finished"
            :key="task.key"
            class="task-item"
            :class="task.state"
          >
            <Check v-if="task.state === 'complete'" :size="22" /><X
              v-else
              :size="22"
            />
            <div>
              <strong>{{ task.name }}</strong>
              <p>{{ task.message }}</p>
              <RouterLink
                v-if="task.kind === 'update' && updates.status === 'ready'"
                to="/settings#updates"
                @click="open = null"
                >Open update settings</RouterLink
              >
            </div>
            <button
              class="icon-button"
              :aria-label="`Remove ${task.name} task`"
              @click="activity.remove(task.key)"
            >
              <Trash2 :size="15" />
            </button>
          </article>
        </section>
      </template>
      <template v-else
        ><div v-if="!activity.notifications.length" class="activity-empty">
          <Bell :size="26" />
          <h3>You’re all caught up</h3>
          <p>Launcher updates will appear here.</p>
        </div>
        <div v-else class="notification-list">
          <button
            class="text-link clear-notifications"
            @click="activity.notifications = []"
          >
            Clear all
          </button>
          <article
            v-for="note in activity.notifications"
            :key="note.id"
            :class="{ error: note.error }"
          >
            <Bell :size="16" />
            <p>{{ note.message }}</p>
            <time :datetime="new Date(note.at).toISOString()">{{
              new Date(note.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}</time>
          </article>
        </div></template
      >
    </section>
  </div>
</template>

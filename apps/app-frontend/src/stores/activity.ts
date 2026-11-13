import { computed, onScopeDispose, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { desktop } from "../api";
import { useFriends } from "./friends";
import { useMessages } from "./messages";
import { defineStore } from "pinia";
import { useGame, terminalStages } from "./game";
import { useContent } from "./content";
import { useLauncher } from "./launcher";
import { useUpdates } from "./updates";
export interface Task {
  key: string;
  name: string;
  message: string;
  state: "active" | "complete" | "error" | "cancelled";
  progress?: number;
  instance?: string;
  kind: "game" | "content" | "update";
  stage: string;
  at: number;
}
export interface Notification {
  id: number;
  message: string;
  at: number;
  read: boolean;
  error: boolean;
}
export const useActivity = defineStore("activity", () => {
  const game = useGame(),
    content = useContent(),
    launcher = useLauncher(),
    updates = useUpdates();
  const tasks = ref<Task[]>([]),
    notifications = ref<Notification[]>([]);
  let started = false,
    sequence = 0;
  const seen = new Map<string, string>();
  const active = computed(() =>
    tasks.value.filter((t) => t.state === "active"),
  );
  const finished = computed(() =>
    tasks.value.filter((t) => t.state !== "active"),
  );
  const unread = computed(
    () => notifications.value.filter((n) => !n.read).length,
  );
  function notify(message: string, error = false) {
    if (!message) return;
    notifications.value = [
      { id: ++sequence, message, error, at: Date.now(), read: false },
      ...notifications.value,
    ].slice(0, 50);
  }
  function notifyDesktop(message: string, error = false) {
    notify(message, error);
    if (desktop)
      void invoke("desktop_notification", { message }).catch(() => {});
  }
  function startSocialNotifications() {
    const friends = useFriends();
    const messages = useMessages();
    let requests: Set<string> | undefined;
    let latestMessages: Map<string, string> | undefined;
    let polling = false;
    watch(
      () => friends.owner,
      () => {
        requests = undefined;
        latestMessages = undefined;
      },
      { flush: "sync" },
    );
    watch(
      () => friends.incoming,
      (incoming) => {
        if (!friends.owner || !friends.loaded) return;
        if (requests && incoming.some((row) => !requests?.has(row.account_id)))
          notifyDesktop("You have a new Azuria friend request.");
        requests = new Set(incoming.map((row) => row.account_id));
      },
      { immediate: true },
    );
    watch(
      () => messages.inbox,
      (inbox) => {
        if (!friends.owner) return;
        if (
          latestMessages &&
          inbox.some((row) => {
            const previous = latestMessages?.get(row.account_id);
            return (
              row.unread > 0 &&
              (!previous || Date.parse(row.latest_at) > Date.parse(previous))
            );
          })
        )
          notifyDesktop("You have a new Azuria message.");
        latestMessages = new Map(
          inbox.map((row) => [row.account_id, row.latest_at]),
        );
      },
      { flush: "sync" },
    );
    async function poll() {
      const owner = friends.owner;
      if (!owner || polling) return;
      polling = true;
      try {
        if (!friends.busy) await friends.refresh();
        if (friends.owner === owner && !messages.active)
          await messages.refreshInbox(true);
      } catch {
        // Background polling retries without interrupting the launcher.
      } finally {
        polling = false;
      }
    }
    watch(
      () => friends.owner,
      () => void poll(),
      { immediate: true },
    );
    const timer = setInterval(() => void poll(), 30000);
    return () => clearInterval(timer);
  }
  let stopSocial: (() => void) | undefined;
  onScopeDispose(() => stopSocial?.());
  function record(task: Omit<Task, "at">) {
    const signature = JSON.stringify(task);
    if (seen.get(task.key) === signature) return;
    const previous = tasks.value.find((t) => t.key === task.key);
    const oldStage = seen.get(task.key);
    seen.set(task.key, signature);
    // Removing a finished item does not resurrect it on unrelated events.
    if (!previous && oldStage && task.state !== "active") return;
    tasks.value = [
      {
        ...task,
        at: task.stage === previous?.stage ? previous.at : Date.now(),
      },
      ...tasks.value.filter((t) => t.key !== task.key),
    ].slice(0, 50);
    if (task.state !== "active" && previous?.state !== task.state) {
      const send =
        previous?.state === "active" && task.state !== "cancelled"
          ? notifyDesktop
          : notify;
      send(`${task.name}: ${task.message}`, task.state === "error");
    }
  }
  function init() {
    if (started) return;
    started = true;
    if (desktop) stopSocial = startSocialNotifications();
    watch(
      () => game.launches,
      (launches) => {
        for (const launch of Object.values(launches)) {
          const terminal = terminalStages.includes(launch.stage);
          // A running game belongs in the running menu, not active downloads.
          const state =
            launch.stage === "running"
              ? "complete"
              : launch.stage === "error" || launch.stage === "crashed"
                ? "error"
                : launch.stage === "cancelled"
                  ? "cancelled"
                  : terminal
                    ? "complete"
                    : "active";
          record({
            key: `game:${launch.id}`,
            kind: "game",
            name:
              launcher.instances.find((i) => i.id === launch.id)?.name ??
              "Minecraft",
            instance: launch.id,
            stage: launch.stage,
            state,
            message: launch.message,
            progress:
              launch.total > 0
                ? Math.min(
                    100,
                    Math.round((launch.completed / launch.total) * 100),
                  )
                : undefined,
          });
        }
      },
      { deep: true, immediate: true },
    );
    watch(
      () => content.job,
      (job) => {
        if (!job) return;
        record({
          key: `content:${job.id}`,
          kind: "content",
          name: "Content installation",
          stage: job.stage,
          state:
            job.stage === "installed"
              ? "complete"
              : job.stage === "error"
                ? "error"
                : job.stage === "cancelled"
                  ? "cancelled"
                  : "active",
          message: job.message,
          progress:
            job.total > 0
              ? Math.min(100, Math.round((job.completed / job.total) * 100))
              : undefined,
        });
      },
      { deep: true, immediate: true },
    );
    watch(
      () => [updates.status, updates.progress, updates.error] as const,
      ([status, progress, error]) => {
        if (
          ![
            "downloading",
            "verifying",
            "ready",
            "installing",
            "error",
          ].includes(status)
        )
          return;
        record({
          key: "update",
          kind: "update",
          name: "Azuria update",
          stage: status,
          state: status === "error" ? "error" : "active",
          message:
            error ||
            (status === "ready"
              ? "Waiting for Minecraft and installations to finish"
              : status === "installing"
                ? "Restarting to install update…"
                : status === "verifying"
                  ? "Verifying update…"
                  : "Downloading update…"),
          progress,
        });
      },
    );
    watch(
      () => launcher.notice,
      (value) => {
        if (value) notify(value);
      },
    );
    watch(
      () => [game.error, content.error, launcher.error],
      (values) => {
        for (const value of values)
          if (value && notifications.value[0]?.message !== value)
            notify(value, true);
      },
    );
  }
  function remove(key: string) {
    tasks.value = tasks.value.filter(
      (t) => t.key !== key || t.state === "active",
    );
  }
  function clearFinished() {
    tasks.value = tasks.value.filter((t) => t.state === "active");
  }
  function markRead() {
    notifications.value.forEach((n) => (n.read = true));
  }
  return {
    tasks,
    notifications,
    active,
    finished,
    unread,
    init,
    notify,
    remove,
    clearFinished,
    markRead,
  };
});

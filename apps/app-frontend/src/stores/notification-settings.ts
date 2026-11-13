import { ref } from "vue";
import { defineStore } from "pinia";

const key = "azuria.notification-settings";
export const notificationLabels = {
  enabled: "Windows notifications",
  requests: "Friend requests",
  messages: "Direct messages",
  tasks: "Launcher task results",
};
export type NotificationCategory = Exclude<
  keyof typeof notificationLabels,
  "enabled"
>;
const defaults = { enabled: true, requests: true, messages: true, tasks: true };

export const useNotificationSettings = defineStore(
  "notification-settings",
  () => {
    const options = ref({ ...defaults });
    const error = ref("");
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      for (const name of Object.keys(defaults) as (keyof typeof defaults)[]) {
        if (typeof saved?.[name] === "boolean")
          options.value[name] = saved[name];
      }
    } catch {
      // Default settings also cover unavailable web storage.
    }

    function set(name: keyof typeof defaults, enabled: boolean) {
      const updated = { ...options.value, [name]: enabled };
      try {
        localStorage.setItem(key, JSON.stringify(updated));
        options.value = updated;
        error.value = "";
      } catch {
        error.value = "Could not save notification settings.";
      }
    }
    return { options, error, set };
  },
);

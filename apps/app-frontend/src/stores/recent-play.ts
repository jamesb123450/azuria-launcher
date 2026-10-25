import { defineStore } from "pinia";
import { ref } from "vue";
const key = "azuria-recent-play-v1";
function read(): Record<string, number> {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data)
        .filter(
          ([id, time]) =>
            id.length < 100 &&
            typeof time === "number" &&
            Number.isFinite(time) &&
            time > 0 &&
            time <= Date.now(),
        )
        .slice(0, 100),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}
export const useRecentPlay = defineStore("recent-play", () => {
  const played = ref(read());
  function remember(id: string) {
    played.value = Object.fromEntries(
      Object.entries({ ...played.value, [id]: Date.now() })
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100),
    );
    try {
      localStorage.setItem(key, JSON.stringify(played.value));
    } catch {
      /* Session history remains usable when storage is unavailable. */
    }
  }
  return { played, remember };
});

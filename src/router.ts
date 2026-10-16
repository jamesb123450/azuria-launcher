import { createRouter, createWebHashHistory } from "vue-router";
import LibraryView from "./views/LibraryView.vue";
import SettingsView from "./views/SettingsView.vue";
import DiscoverView from "./views/DiscoverView.vue";
import RoadmapView from "./views/RoadmapView.vue";
import InstanceView from "./views/InstanceView.vue";
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to) {
    return to.hash ? { el: to.hash, behavior: "smooth" } : { top: 0 };
  },
  routes: [
    { path: "/", component: LibraryView },
    { path: "/settings", component: SettingsView },
    { path: "/instances/:id", name: "instance", component: InstanceView },
    {
      path: "/instances/:id/settings/:section?",
      name: "instance-settings",
      component: InstanceView,
    },
    { path: "/discover", component: DiscoverView },
    { path: "/roadmap", component: RoadmapView },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

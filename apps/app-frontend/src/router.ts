import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "./views/HomeView.vue";
import VersionsView from "./views/VersionsView.vue";
import SettingsView from "./views/SettingsView.vue";
import ProjectView from "./views/ProjectView.vue";
import DiscoverView from "./views/DiscoverView.vue";
import RoadmapView from "./views/RoadmapView.vue";
import WardrobeView from "./views/WardrobeView.vue";
import ScreenshotsView from "./views/ScreenshotsView.vue";
import InstanceView from "./views/InstanceView.vue";
export const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to) {
    if (to.path === "/settings") return false;
    return to.hash ? { el: to.hash, behavior: "smooth" } : { top: 0 };
  },
  routes: [
    { path: "/", component: HomeView },
    { path: "/versions", component: VersionsView },
    { path: "/library", redirect: "/versions?tab=setups" },
    { path: "/settings", component: SettingsView },
    { path: "/wardrobe", component: WardrobeView },
    { path: "/screenshots", component: ScreenshotsView },
    { path: "/instances/:id", name: "instance", component: InstanceView },
    {
      path: "/instances/:id/settings/:section?",
      redirect: (to) => ({
        name: "instance",
        params: { id: to.params.id },
        query: { settings: String(to.params.section ?? "general") },
      }),
    },
    { path: "/discover", component: DiscoverView },
    { path: "/discover/:provider/:kind/:project", component: ProjectView },
    { path: "/roadmap", component: RoadmapView },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

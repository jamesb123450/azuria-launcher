import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryView from './views/LibraryView.vue'
import SettingsView from './views/SettingsView.vue'
import RoadmapView from './views/RoadmapView.vue'
export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: LibraryView },
  { path: '/settings', component: SettingsView },
  { path: '/roadmap', component: RoadmapView },
  { path: '/:pathMatch(.*)*', redirect: '/' },
] })

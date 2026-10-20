import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import GameMonitor from "./views/GameMonitor.vue";
import { router } from "./router";
import "./style.css";
import "./redesign.css";
createApp(window.location.hash.startsWith("#/monitor/") ? GameMonitor : App)
  .use(createPinia())
  .use(router)
  .mount("#app");

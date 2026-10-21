<script setup lang="ts">
import { provide } from "vue";
import {
  routeLocationKey,
  type RouteLocationNormalizedLoaded,
  type RouteLocationNormalized,
} from "vue-router";
const props = defineProps<{ route: RouteLocationNormalized }>();
// Keep route-dependent background content on its own route while Settings is open.
provide(
  routeLocationKey,
  new Proxy({} as RouteLocationNormalizedLoaded, {
    get: (_, key) => Reflect.get(props.route, key),
  }),
);
</script>
<template>
  <div class="route-surface-frame" :key="route.path">
    <RouterView :route="route" />
  </div>
</template>
<style>
.route-surface-frame {
  min-width: 0;
  animation: page-surface-arrive 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@keyframes page-surface-arrive {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .route-surface-frame {
    animation: none;
  }
}
</style>

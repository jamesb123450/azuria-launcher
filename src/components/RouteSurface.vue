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
<template><RouterView :route="route" /></template>

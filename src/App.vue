<script setup lang="ts">
import { onMounted } from 'vue'
import { Library, Settings, Compass, ArrowUpRight, Layers3, GitBranch } from '@lucide/vue'
import { useLauncher } from './stores/launcher'
import { desktop } from './api'
const store = useLauncher()
onMounted(store.init)
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink class="brand" to="/" aria-label="Azuria home"><span class="brand-mark">A</span><span>azuria<span class="brand-caption">MINECRAFT LAUNCHER</span></span></RouterLink>
      <div class="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        <RouterLink to="/" class="nav-link"><Library :size="19"/> Library <span class="nav-count">{{ store.instances.length }}</span></RouterLink>
        <RouterLink to="/roadmap" class="nav-link"><Compass :size="19"/> Discover <span class="soon-dot" title="Planned feature"/></RouterLink>
      </nav>
      <div class="sidebar-note"><Layers3 :size="23"/><strong>A space for every world.</strong><p>Keep your adventures organised, your way.</p><RouterLink to="/roadmap">See what’s coming <ArrowUpRight :size="14"/></RouterLink></div>
      <div class="sidebar-bottom"><RouterLink to="/settings" class="nav-link"><Settings :size="19"/> Settings</RouterLink><a class="nav-link" href="https://github.com/jamesb123450/azuria-launcher" target="_blank" rel="noreferrer"><GitBranch :size="19"/> Project on GitHub <ArrowUpRight :size="14"/></a><div class="build-label"><span class="status-dot"/> Azuria 0.1.0 <span>FOUNDATION</span></div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><span>YOUR NEXT ADVENTURE STARTS HERE</span><RouterLink class="account-chip" to="/roadmap"><span class="avatar">A</span><span>Welcome to Azuria<small>Microsoft sign-in coming next</small></span></RouterLink></header>
      <div v-if="!desktop" class="preview-banner">Browser preview · Data stays in this browser. The desktop app uses Rust and SQLite.</div>
      <main id="main-content"><div v-if="store.error" class="alert error" role="alert">{{ store.error }} <button @click="store.error = ''" aria-label="Dismiss error">×</button></div><div v-if="store.notice" class="alert success" role="status">{{ store.notice }}<button @click="store.notice = ''" aria-label="Dismiss notification">×</button></div><RouterView/></main>
      <footer class="app-footer"><span><span class="status-dot"/> {{ desktop ? 'Local desktop workspace' : 'Browser preview' }}</span><span>Made for your next chapter.</span></footer>
    </div>
  </div>
</template>

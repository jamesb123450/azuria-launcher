<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Newspaper, ArrowUpRight } from "@lucide/vue";
import { newsApi, coverURL, storyURL, type NewsFeed } from "../news-api";
import { contentApi } from "../content-api";
const feed = ref<NewsFeed>({ url: "", stories: [] });
const loading = ref(true),
  error = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    feed.value = await newsApi.load();
  } catch {
    error.value = "News could not be loaded. Please try again.";
  } finally {
    loading.value = false;
  }
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
async function open(url: string) {
  try {
    await contentApi.open(url);
  } catch {
    error.value = "The news page could not be opened. Please try again.";
  }
}
onMounted(load);
</script>
<template>
  <section class="home-news" aria-labelledby="home-news-heading">
    <div class="home-news-heading">
      <h2 id="home-news-heading">Latest from Azuria</h2>
      <button
        class="text-button"
        @click="open('https://launcher.azuriasmp.org/news/')"
      >
        All news <ArrowUpRight :size="14" />
      </button>
    </div>
    <p v-if="loading" class="news-feed-status" role="status">Loading news…</p>
    <div v-if="error" class="news-feed-status" role="alert">
      <p>{{ error }}</p>
      <button class="button secondary" @click="load">Try again</button>
    </div>
    <div
      v-if="!loading && !error && !feed.stories.length"
      class="news-coming-soon"
    >
      <Newspaper :size="30" aria-hidden="true" />
      <h3>No news yet</h3>
      <p>Updates from Azuria Studios will appear here.</p>
    </div>
    <div v-if="feed.stories.length" class="home-news-grid">
      <button
        v-for="story in feed.stories"
        :key="story.slug"
        class="home-news-card"
        @click="open(storyURL(story.slug))"
      >
        <img
          :src="coverURL(feed.url, story.cover_path)"
          :alt="story.cover_alt"
          :data-position="story.image_position"
          loading="lazy"
        />
        <div>
          <time :datetime="story.published_at">{{
            date(story.published_at)
          }}</time>
          <h3>{{ story.title }}</h3>
          <p>{{ story.summary }}</p>
          <span>Read story <ArrowUpRight :size="14" /></span>
        </div>
      </button>
    </div>
  </section>
</template>
<style scoped>
.home-news-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.home-news-heading button {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.75rem;
}
.home-news-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-top: 14px;
}
.home-news-card {
  padding: 0;
  text-align: left;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  color: var(--text);
  cursor: pointer;
  transition:
    border-color 0.2s,
    transform 0.2s;
}
.home-news-card:hover {
  border-color: #d89bc08c;
  transform: translateY(-3px);
}
.home-news-card:focus-visible {
  outline: 2px solid #a6bfff;
  outline-offset: 3px;
}
.home-news-card img {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
}
.home-news-card img[data-position="top"] {
  object-position: center top;
}
.home-news-card img[data-position="bottom"] {
  object-position: center bottom;
}
.home-news-card > div {
  padding: 16px;
}
.home-news-card time {
  font-size: 0.7rem;
  color: var(--muted);
}
.home-news-card h3 {
  font-size: 0.95rem;
  line-height: 1.45;
  margin: 8px 0;
  overflow-wrap: anywhere;
}
.home-news-card p {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.home-news-card span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--text);
  margin-top: 16px;
}
.news-feed-status {
  padding: 20px;
  color: var(--muted);
}
@media (prefers-reduced-motion: reduce) {
  .home-news-card {
    transition: none;
  }
  .home-news-card:hover {
    transform: none;
  }
}
</style>

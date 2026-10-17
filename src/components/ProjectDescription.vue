<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { contentImage } from "../lib/content-images";
import { contentApi } from "../content-api";
const props = defineProps<{ body: string; html?: boolean }>();
const rendered = computed(() => {
  const clean = DOMPurify.sanitize(
    props.html ? props.body : marked.parse(props.body, { async: false }),
    {
      FORBID_TAGS: [
        "style",
        "form",
        "input",
        "button",
        "iframe",
        "video",
        "audio",
        "svg",
      ],
      FORBID_ATTR: ["style", "srcset", "id", "name", "target"],
    },
  );
  const root = document.createElement("div");
  root.innerHTML = clean;
  root.querySelectorAll("img").forEach((img) => {
    const safe = contentImage(img.getAttribute("src"));
    if (safe) {
      img.src = safe;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
    } else img.remove();
  });
  root.querySelectorAll("a").forEach((a) => {
    try {
      if (new URL(a.href).protocol !== "https:") a.removeAttribute("href");
    } catch {
      a.removeAttribute("href");
    }
  });
  return root.innerHTML;
});
function open(event: MouseEvent) {
  const link = (event.target as Element).closest("a");
  if (link?.href) {
    event.preventDefault();
    void contentApi.open(link.href);
  }
}
</script>
<template>
  <article
    class="project-description"
    @click="open"
    v-html="rendered"
  ></article>
</template>
<style scoped>
.project-description {
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.project-description :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}
.project-description :deep(pre) {
  overflow: auto;
  background: var(--bg);
  padding: 16px;
  border-radius: 8px;
}
.project-description :deep(table) {
  display: block;
  overflow: auto;
  border-collapse: collapse;
}
.project-description :deep(td),
.project-description :deep(th) {
  padding: 8px;
  border: 1px solid var(--border);
}
.project-description :deep(a) {
  color: var(--accent);
}
.project-description :deep(h1) {
  font-size: 27px;
}
.project-description :deep(h2) {
  font-size: 22px;
}
</style>

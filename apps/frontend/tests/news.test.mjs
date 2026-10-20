import test from "node:test";
import assert from "node:assert/strict";
import {
  coverURL,
  newsDate,
  newsArticle,
  newsBody,
} from "../src/news-model.mjs";

// A text-only DOM fixture makes accidental HTML rendering fail immediately.
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this._text = "";
  }
  set innerHTML(_) {
    throw new Error("News must not interpret HTML");
  }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return (
      this._text +
      this.children
        .map((child) => (typeof child === "string" ? child : child.textContent))
        .join("")
    );
  }
  getAttribute(name) {
    return this[name] ?? null;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tag === "#fragment") this.children.push(...node.children);
      else this.children.push(node);
    }
  }
}
const document = {
  createElement: (tag) => new Element(tag),
  createDocumentFragment: () => new Element("#fragment"),
};
const base = "https://example.supabase.co";
const path =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
const post = {
  title: "A new chapter",
  body: "First paragraph.\n\n## What’s next\n\n- One\n- Two",
  cover_path: path,
  cover_alt: "A Minecraft forest",
  accent: "blue",
  image_position: "top",
  reading_width: "wide",
  author_username: "azuria",
  published_at: "2026-10-21T23:59:00Z",
};
test("articles put the shared cover before title, date, original username and faded admin role, then body", () => {
  const article = newsArticle(post, base, { document });
  const [image, content] = article.children;
  assert.equal(image.tag, "img");
  assert.equal(
    image.src,
    `${base}/storage/v1/object/public/news-images/${path}`,
  );
  assert.equal(image.alt, post.cover_alt);
  assert.equal(image.dataset.position, "top");
  assert.deepEqual(
    content.children.map((node) => node.tag),
    ["h1", "p", "div"],
  );
  assert.equal(content.children[0].textContent, post.title);
  const byline = content.children[1];
  assert.equal(byline.children[0].tag, "time");
  assert.equal(byline.textContent, "21 October 2026 · azuria (admin)");
  assert.equal(byline.children[2].className, "news-admin");
  assert.match(content.children[2].textContent, /First paragraph/);
  assert.equal(article.dataset.width, "wide");
  assert.equal(article.dataset.accent, "blue");
});
test("news body handles paragraphs, headings and lists without interpreting hostile HTML", () => {
  const result = newsBody(
    "Hello <img src=x onerror=alert(1)>\n\n# Heading\n\n- <script>bad()</script>\n- Two",
    document,
  );
  assert.deepEqual(
    result.children.map((node) => node.tag),
    ["p", "h2", "ul"],
  );
  assert.equal(
    result.children[0].textContent,
    "Hello <img src=x onerror=alert(1)>",
  );
  assert.equal(
    result.children[2].children[0].textContent,
    "<script>bad()</script>",
  );
  const article = newsArticle(
    {
      ...post,
      title: "<script>bad()</script>",
      author_username: "<img>",
      accent: "evil",
      image_position: "evil",
      reading_width: "evil",
    },
    base,
    { document },
  );
  assert.equal(
    article.children[1].children[0].textContent,
    "<script>bad()</script>",
  );
  assert.equal(article.dataset.accent, "pink");
  assert.equal(article.dataset.width, "comfortable");
  assert.equal(article.children[0].dataset.position, "center");
});
test("cover URLs reject external origins, credentials, traversal and active image formats", () => {
  for (const [url, asset] of [
    ["https://evil.test", path],
    ["https://example.supabase.co.evil.test", path],
    ["https://user:pass@example.supabase.co", path],
    ["http://example.supabase.co", path],
    [base, "../escape.jpg"],
    [base, path.replace(".webp", ".svg")],
  ])
    assert.equal(coverURL(url, asset), "");
  assert.equal(newsDate("not a date"), "");
  assert.equal(newsDate("2026-10-21T00:00:00Z"), "21 October 2026");
});

import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewController } from "../src/motion.mjs";

function fixture({ reduced = false, preload = async () => {} } = {}) {
  const animations = [];
  const image = {
    src: "dark.webp",
    alt: "Dark library",
    getAttribute(name) {
      return this[name];
    },
    animate() {
      const animation = {
        cancelled: false,
        cancel() {
          this.cancelled = true;
        },
        finished: new Promise(() => {}),
      };
      animations.push(animation);
      return animation;
    },
    cloneNode() {
      return {
        src: this.src,
        alt: this.alt,
        removeAttribute() {},
        setAttribute() {},
        classList: { add() {} },
        remove() {
          this.removed = true;
        },
        animate: this.animate,
      };
    },
  };
  const frame = {
    busy: false,
    children: [],
    append(node) {
      this.children.push(node);
    },
    setAttribute() {
      this.busy = true;
    },
    removeAttribute() {
      this.busy = false;
    },
  };
  const button = (theme) => ({
    dataset: {
      previewImage: theme + ".webp",
      previewAlt: theme + " library",
      previewCaption: theme + " appearance",
    },
    setAttribute(name, value) {
      this[name] = value;
    },
  });
  const buttons = [button("dark"), button("light")];
  buttons[0]["aria-pressed"] = "true";
  buttons[1]["aria-pressed"] = "false";
  const caption = { textContent: "dark appearance" };
  const status = { textContent: "" };
  const media = {
    matches: reduced,
    addEventListener(_event, listener) {
      this.listener = listener;
    },
  };
  return {
    image,
    frame,
    buttons,
    caption,
    status,
    media,
    animations,
    controller: createPreviewController({
      image,
      frame,
      buttons,
      caption,
      status,
      media,
      preload,
    }),
  };
}

test("appearance switching crossfades only after decoding and keeps a single accessible image", async () => {
  let release;
  const f = fixture({
    preload: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const selected = f.controller.select(f.buttons[1]);
  assert.equal(f.image.src, "dark.webp");
  assert.equal(f.frame.busy, true);
  release();
  assert.equal(await selected, true);
  assert.equal(f.image.src, "light.webp");
  assert.equal(f.image.alt, "light library");
  assert.equal(f.caption.textContent, "light appearance");
  assert.equal(f.buttons[1]["aria-pressed"], "true");
  assert.equal(f.frame.busy, false);
  assert.equal(f.frame.children.length, 1);
  assert.equal(f.frame.children[0].alt, "");
  assert.equal(f.animations.length, 2);
  f.controller.finishMotion();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.equal(f.frame.children[0].removed, true);
});

test("reduced motion switches immediately and honours a preference change mid-animation", async () => {
  const reduced = fixture({ reduced: true });
  await reduced.controller.select(reduced.buttons[1]);
  assert.equal(reduced.image.src, "light.webp");
  assert.equal(reduced.animations.length, 0);
  assert.equal(reduced.frame.children.length, 0);
  const f = fixture();
  await f.controller.select(f.buttons[1]);
  f.media.matches = true;
  f.media.listener();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.equal(f.image.src, "light.webp");
});

test("a late image load cannot override the user's newer selection", async () => {
  let release;
  const f = fixture({
    preload: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const light = f.controller.select(f.buttons[1]);
  await f.controller.select(f.buttons[0]);
  release();
  assert.equal(await light, false);
  assert.equal(f.image.src, "dark.webp");
  assert.equal(f.buttons[0]["aria-pressed"], "true");
  assert.equal(f.frame.busy, false);
});

test("failed previews retain their screenshot, accessible label and selection", async () => {
  const f = fixture({
    preload: async () => {
      throw Error("image unavailable");
    },
  });
  assert.equal(await f.controller.select(f.buttons[1]), false);
  assert.equal(f.image.src, "dark.webp");
  assert.equal(f.image.alt, "Dark library");
  assert.equal(f.buttons[0]["aria-pressed"], "true");
  assert.equal(f.frame.busy, false);
  assert.match(f.status.textContent, /could not load/);
});

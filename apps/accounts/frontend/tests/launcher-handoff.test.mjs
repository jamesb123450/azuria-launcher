import test from "node:test";
import assert from "node:assert/strict";
import { launcherReturnURL } from "../src/launcher-handoff.js";
test("launcher returns only a short-lived code and its original PKCE request challenge", () => {
  const url = new URL(launcherReturnURL("a".repeat(43), "b".repeat(43)));
  assert.equal(url.protocol, "azuria:");
  assert.equal(url.host, "auth");
  assert.equal(url.pathname, "/callback");
  assert.deepEqual([...url.searchParams.keys()], ["code", "state"]);
  assert.equal(url.searchParams.get("code"), "a".repeat(43));
  assert.equal(url.searchParams.get("state"), "b".repeat(43));
});
test("launcher link builder cannot inject other schemes, tokens or redirect targets", () => {
  for (const value of [
    "",
    null,
    "short",
    "https://evil.test",
    "a".repeat(43) + "&access_token=secret",
    "a".repeat(44),
  ]) {
    assert.throws(() => launcherReturnURL(value, "b".repeat(43)));
    assert.throws(() => launcherReturnURL("a".repeat(43), value));
  }
});

test("browser handoff tries reopening once and retains an explicit Open button and collapsed code fallback", async () => {
  const { showLauncherHandoff } = await import("../src/launcher-handoff.js");
  const previous = globalThis.document;
  globalThis.document = {
    createElement: (tag) => ({
      tag,
      children: [],
      append(...nodes) {
        this.children.push(...nodes);
      },
    }),
  };
  try {
    const opened = [];
    let rendered = [];
    let title = "";
    const button = (text, action, className) => ({
      tag: "button",
      text,
      action,
      className,
    });
    showLauncherHandoff({
      code: "a".repeat(43),
      challenge: "b".repeat(43),
      open: (href) => opened.push(href),
      ui: {
        heading: (text) => {
          title = text;
        },
        render: (...nodes) => {
          rendered = nodes;
        },
        paragraph: (text) => ({ tag: "p", text }),
        button,
        message: () => {},
        back: { tag: "button", text: "Back" },
      },
    });
    assert.equal(title, "Return to Azuria");
    assert.equal(opened.length, 1);
    const launch = rendered.find(
      (node) => node.text === "Open Azuria Launcher",
    );
    launch.action();
    assert.equal(opened.length, 2);
    const fallback = rendered.find((node) => node.tag === "details");
    assert.equal(Boolean(fallback.open), false);
    assert.equal(
      fallback.children[0].textContent,
      "Use a connection code instead",
    );
    assert.equal(
      fallback.children.find((node) => node.tag === "code").textContent,
      "a".repeat(43),
    );
  } finally {
    globalThis.document = previous;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
for (const site of ["apps/frontend", "apps/azuria-studios/frontend"]) {
  test(`${site}: cookie choices do not jump to the footer and explicit reopening restores focus without scrolling`, async () => {
    const calls = [];
    const control = (name) => ({
      dataset: {},
      addEventListener(_, fn) {
        this.click = fn;
      },
      focus(options) {
        calls.push({ name, options });
      },
    });
    const footer = control("footer"),
      accept = control("accept"),
      reject = control("reject");
    accept.dataset.analyticsChoice = "accepted";
    reject.dataset.analyticsChoice = "rejected";
    const banner = {
      hidden: true,
      querySelector: () => reject,
      querySelectorAll: () => [accept, reject],
    };
    const announcement = { textContent: "" };
    const document = {
      cookie: "",
      querySelector(selector) {
        return selector === "script[data-measurement-id]"
          ? { dataset: { measurementId: "", consentKey: "test-choice" } }
          : selector === ".analytics-banner"
            ? banner
            : announcement;
      },
      querySelectorAll: () => [footer],
    };
    const window = { addEventListener() {} };
    const location = {
      hostname: "example.test",
      pathname: "/",
      href: "https://example.test/",
      reload() {
        throw Error("No reload expected with analytics unloaded");
      },
    };
    const localStorage = { getItem: () => null, setItem() {} };
    runInNewContext(
      await readFile(
        new URL(`../${site}/src/analytics.js`, import.meta.url),
        "utf8",
      ),
      { window, document, location, localStorage, Date, URL },
    );
    assert.equal(banner.hidden, false);
    accept.click();
    assert.equal(banner.hidden, true);
    assert.equal(
      calls.length,
      0,
      "initial acceptance must not focus the footer",
    );
    footer.click();
    assert.equal(banner.hidden, false);
    reject.click();
    assert.equal(banner.hidden, true);
    assert.equal(calls.at(-1).name, "footer");
    assert.equal(calls.at(-1).options.preventScroll, true);
    const count = calls.length;
    accept.click();
    assert.equal(calls.length, count, "stale return focus must be cleared");
  });
}

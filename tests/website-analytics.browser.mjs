// Run after building both sites with AZURIA_GA_MEASUREMENT_ID=G-ABCDE12345.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../apps/app-frontend/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const servers = [];
let browser;
try {
  for (const script of [
    "apps/frontend/scripts/serve.mjs",
    "apps/azuria-studios/frontend/scripts/serve.mjs",
  ]) {
    const server = spawn(process.execPath, [script], {
      cwd: new URL("../", import.meta.url),
    });
    servers.push(server);
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) =>
        reject(new Error(`Preview exited: ${code}`)),
      );
    });
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  for (const [site, url, legal] of [
    ["launcher", "http://127.0.0.1:8080/azuria-releases/", "privacy/"],
    ["studios", "http://127.0.0.1:4175/", "privacy/"],
  ]) {
    const context = await browser.newContext();
    let requests = 0;
    const errors = [];
    await context.route("https://www.googletagmanager.com/**", (route) => {
      requests++;
      return route.fulfill({
        contentType: "text/javascript",
        body: "window.testGoogleLoaded=true;",
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url + "?private=secret#section");
    assert(await page.locator(".analytics-banner").isVisible());
    assert.equal(requests, 0, `${site}: no Google request before consent`);
    if (process.env.AZURIA_TEST_ANALYTICS_DISABLED === "true") {
      assert.equal(
        await page
          .locator("script[data-measurement-id]")
          .getAttribute("data-measurement-id"),
        "",
      );
      await page
        .getByRole("button", { name: "Accept analytics", exact: true })
        .click();
      assert(await page.locator(".analytics-banner").isHidden());
      assert.equal(
        await page
          .locator('script[src^="https://www.googletagmanager.com/"]')
          .count(),
        0,
      );
      assert.equal(requests, 0);
      await page.reload();
      assert.equal(requests, 0);
      await context.close();
      console.log(
        `${site}: PASS analytics remains disabled without a measurement ID, including after acceptance and reload`,
      );
      continue;
    }

    for (const width of [1280, 736, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page
      .getByRole("button", { name: "Reject analytics", exact: true })
      .click();
    await page.reload();
    assert(await page.locator(".analytics-banner").isHidden());
    assert.equal(requests, 0, `${site}: no Google request after rejection`);
    await page
      .getByRole("button", { name: "Cookie settings", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Accept analytics", exact: true })
      .click();
    await page.waitForFunction(() => window.testGoogleLoaded);
    assert.equal(requests, 1);
    const commands = await page.evaluate(() =>
      window.dataLayer.map((args) => Array.from(args)),
    );
    assert.equal(
      commands.find((args) => args[0] === "consent" && args[1] === "default")[2]
        .ad_storage,
      "denied",
    );
    const config = commands.find((args) => args[0] === "config")[2];
    assert(!config.page_location.includes("?"));
    assert(!config.page_location.includes("#"));
    assert.equal(config.allow_google_signals, false);
    await page.goto(url + legal);
    await page.waitForFunction(() => window.testGoogleLoaded);
    assert.equal(requests, 2, `${site}: acceptance persists on legal pages`);
    await page.evaluate(() => {
      document.cookie = "_ga=test; path=/";
      document.cookie = "_ga_ABCDE12345=test; path=/";
    });
    await page
      .getByRole("button", { name: "Cookie settings", exact: true })
      .click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("button", { name: "Reject analytics", exact: true })
        .click(),
    ]);
    assert.equal(requests, 2, `${site}: withdrawal does not load Google again`);
    assert(
      !(await context.cookies()).some((cookie) =>
        cookie.name.startsWith("_ga"),
      ),
    );
    const key = `azuria-${site}.analytics.v2`;
    for (const record of [
      {
        choice: "accepted",
        at: Date.now() - 181 * 86400000,
        measurement: "G-ABCDE12345",
      },
      { choice: "accepted", at: Date.now(), measurement: "G-DIFFERENT" },
      "malformed",
    ]) {
      await page.evaluate(
        ([key, record]) =>
          localStorage.setItem(
            key,
            typeof record === "string" ? record : JSON.stringify(record),
          ),
        [key, record],
      );
      await page.reload();
      assert(await page.locator(".analytics-banner").isVisible());
      assert.equal(
        requests,
        2,
        `${site}: invalid or expired consent does not load Google`,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw Error("blocked");
      };
      Storage.prototype.setItem = () => {
        throw Error("blocked");
      };
    });
    const blockedPage = await blocked.newPage();
    await blockedPage.goto(url);
    await blockedPage
      .getByRole("button", { name: "Reject analytics", exact: true })
      .click();
    assert(await blockedPage.locator(".analytics-banner").isHidden());
    await blocked.close();
    console.log(
      `${site}: PASS consent gating, persistence, withdrawal/cookie cleanup, expiry, changed ID, malformed/blocked storage, mobile sizes and no runtime errors`,
    );
  }
} finally {
  if (browser) await browser.close();
  servers.forEach((server) => server.kill());
}

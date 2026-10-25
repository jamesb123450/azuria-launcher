import { test, expect } from "@playwright/test";
const versions = {
  versions: [
    { id: "1.21.1", type: "release" },
    { id: "1.20.1", type: "release" },
    { id: "24w14a", type: "snapshot" },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({ json: versions }),
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("azuria-preview-v1"))
      localStorage.setItem(
        "azuria-preview-v1",
        JSON.stringify({ instances: [], settings: { theme: "dark" } }),
      );
  });
});
test("Home matches the launch-first design, with honest preview and no generated news", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to Azuria" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No news yet", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".home-scenery")).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  await expect(page.locator(".launch-main")).toHaveCount(0);
  for (const width of [900, 1024, 1280, 1588]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const hero = await page.locator(".home-hero").boundingBox();
    const context = await page.locator(".home-sponsor-rail").boundingBox();
    expect(hero!.x + hero!.width).toBeLessThanOrEqual(context!.x);
    await page.screenshot({
      path: test.info().outputPath(`home-${width}.png`),
    });
  }
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("azuria-preview-v1")!).instances,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test("Home without profiles offers version browsing without a standalone launch", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Choose version and loader" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Choose a version", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/versions$/);
  await expect(
    page.getByRole("button", { name: "Choose Minecraft 1.21.1", exact: true }),
  ).toBeVisible();
});
test("Home profile settings opens the chosen profile directly", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "azuria-preview-v1",
      JSON.stringify({
        settings: { theme: "dark" },
        instances: [
          {
            id: "survival",
            name: "Survival",
            loader: "vanilla",
            minecraftVersion: "1.21.1",
            memoryMb: 4096,
            favorite: false,
            createdAt: 1,
          },
        ],
      }),
    ),
  );
  await page.goto("/");
  await page
    .getByRole("link", { name: "Settings for Survival", exact: true })
    .click();
  await expect(page).toHaveURL(/instances\/survival\?settings=general/);
  await expect(
    page.getByRole("dialog", { name: "Instance settings", exact: true }),
  ).toBeVisible();
});
test("light appearance keeps log colours scoped and returns to Home cleanly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings
    .getByRole("button", { name: "Light Use the light theme" })
    .click();
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await settings.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator("html")).toHaveCSS("color", "rgb(34, 42, 60)");
  await expect(page.locator(".home-hero")).toBeVisible();
  await page
    .getByRole("link", { name: "Skins and capes", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Skins Your Minecraft appearance",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh saved skins" }),
  ).toBeVisible();
  await expect(page.locator("summary button")).toHaveCount(0);
});

test("player Home ranks actual play history and keeps account clear of launch controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "azuria-preview-v1",
      JSON.stringify({
        settings: { theme: "dark" },
        instances: [
          {
            id: "creative",
            name: "Creative",
            loader: "vanilla",
            minecraftVersion: "1.21.1",
            memoryMb: 4096,
            favorite: true,
            createdAt: 2,
          },
          {
            id: "survival",
            name: "Survival",
            loader: "fabric",
            minecraftVersion: "1.20.1",
            memoryMb: 4096,
            favorite: false,
            createdAt: 1,
          },
        ],
      }),
    );
    localStorage.setItem(
      "azuria-recent-play-v1",
      JSON.stringify({ survival: Date.now() - 60000 }),
    );
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recently played" }),
  ).toBeVisible();
  await expect(page.locator(".home-profile-card").first()).toContainText(
    "Survival",
  );
  await page.locator(".home-profile-select").first().click();
  await expect(page.locator(".home-profile-card").first()).toHaveClass(
    /selected/,
  );
  await expect(page.locator(".home-sponsor-rail .square-ad")).toHaveCount(2);
  for (const width of [900, 1280, 1588]) {
    await page.setViewportSize({ width, height: 960 });
    const account = await page.locator(".player-account").boundingBox();
    const launch = await page.locator(".home-profiles").boundingBox();
    expect(account!.y + account!.height).toBeLessThan(launch!.y);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: test.info().outputPath(`player-home-${width}.png`),
    });
  }
  await page
    .getByRole("button", { name: "Player scene account options" })
    .click();
  await expect(page.locator("#minecraft-account-menu-hero")).toBeVisible();
});

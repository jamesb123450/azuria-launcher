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
    1024,
  );
  await expect(page.getByRole("button", { name: /Launch game/ })).toBeEnabled();
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
  await page.getByRole("button", { name: /Launch game/ }).click();
  await expect(page.getByRole("alert")).toContainText(
    "browser preview cannot launch",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("azuria-preview-v1")!).instances,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test("version and loader picker persists selection, restores focus and supports version browsing", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", {
    name: "Choose version and loader",
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Choose what to play" });
  await dialog
    .getByRole("combobox", { name: "Home Minecraft version" })
    .click();
  await page
    .getByRole("option", { name: "1.20.1release", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Fabric", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".launch-main")).toContainText(
    "Minecraft 1.20.1 · Fabric",
  );
  await page.reload();
  await expect(page.locator(".launch-main")).toContainText(
    "Minecraft 1.20.1 · Fabric",
  );
  await page
    .getByRole("link", { name: "Versions", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Choose Minecraft 24w14a" }),
  ).toHaveCount(0);
  await page.getByLabel("Snapshots & older builds").check();
  await page.getByRole("button", { name: "Choose Minecraft 24w14a" }).click();
  await expect(page.locator(".launch-main")).toContainText("24w14a");
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Choose version and loader" }).click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
test("failed version catalogue gives a retry and working manual entry", async ({
  page,
}) => {
  await page.route("https://piston-meta.mojang.com/**", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Choose version and loader" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose what to play" });
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t load");
  await dialog.getByText("Enter a version manually", { exact: true }).click();
  await dialog.getByLabel("Minecraft version", { exact: true }).fill("1.21.1");
  await dialog.getByRole("button", { name: "Use version" }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".launch-main")).toContainText("Minecraft 1.21.1");
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
  await expect(page.locator(".launch-main")).toBeVisible();
  await page
    .getByRole("link", { name: "Skins and capes", exact: true })
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
  await expect(page.locator(".launch-main")).toContainText("1.20.1");
  await expect(page.locator(".home-sponsor-rail .square-ad")).toHaveCount(2);
  for (const width of [900, 1280, 1588]) {
    await page.setViewportSize({ width, height: 960 });
    const account = await page.locator(".player-account").boundingBox();
    const launch = await page.locator(".hero-launch-bar").boundingBox();
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

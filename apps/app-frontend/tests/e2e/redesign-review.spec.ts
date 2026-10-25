import { test, expect } from "@playwright/test";
test("review updated Home, profiles, creation and wardrobe", async ({
  page,
}) => {
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({
      json: {
        versions: [
          { id: "1.21.1", type: "release" },
          { id: "1.20.1", type: "release" },
        ],
      },
    }),
  );
  await page.addInitScript(() => {
    if (!localStorage.getItem("azuria-preview-v1"))
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
              favorite: true,
              createdAt: 1,
            },
            {
              id: "creative",
              name: "Creative",
              loader: "fabric",
              minecraftVersion: "1.20.1",
              memoryMb: 4096,
              favorite: false,
              createdAt: 2,
            },
          ],
        }),
      );
  });
  await page.setViewportSize({ width: 1588, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".home-scenery")).toHaveJSProperty(
    "naturalWidth",
    1600,
  );
  await expect(page.locator(".news-placeholder")).toHaveCount(2);
  await expect(page.locator(".home-sponsor-rail .square-ad")).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("home.png"),
  });
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Chat", exact: true }),
  ).toContainText("Sign in to your Azuria account");
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("chat.png"),
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Chat", exact: true }),
  ).toBeFocused();
  await page.goto("/#/versions?tab=setups");
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("profiles.png"),
  });
  await page.getByRole("button", { name: "New profile", exact: true }).click();
  await expect(page.getByLabel("Instance name", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fabric", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("new-profile.png"),
  });
  await page.keyboard.press("Escape");
  await page.goto("/#/wardrobe");
  await expect(page.locator(".coming-soon-banner")).toHaveText("COMING SOON");
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("wardrobe.png"),
  });
  await page
    .getByRole("button", {
      name: "Skins Your Minecraft appearance",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Search saved skins")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("skins.png"),
  });
  await page
    .getByRole("button", {
      name: "Capes Your owned Minecraft capes",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "No cape", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath("capes.png"),
  });
});

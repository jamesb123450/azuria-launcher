import { test, expect } from "@playwright/test";
test("Azuria inventory and registry are separate from official Minecraft capes", async ({
  page,
}) => {
  await page.goto("/#/wardrobe");
  await expect(
    page.getByRole("heading", { name: "Your Azuria capes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Open the installed launcher to manage your Azuria capes."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "In-game display is not available until the companion mod is released.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registry Explore Azuria cosmetics" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Azuria cape collection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /buy|purchase|gems/i }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Capes Your owned Minecraft capes" })
    .click();
  await expect(page.locator(".skin-owned-capes")).toBeVisible();
});

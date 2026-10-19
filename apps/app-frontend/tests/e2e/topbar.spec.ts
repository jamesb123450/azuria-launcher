import { expect, test } from "@playwright/test";

test("topbar follows navigation with working history controls", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.locator("header.topbar");
  await expect(
    header.getByRole("button", { name: "Go back", exact: true }),
  ).toBeDisabled();
  await expect(header.getByRole("status")).toHaveText("No games running");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Discover", exact: true })
    .click();
  await expect(header.locator(".breadcrumb")).toHaveText("Discover");
  await header.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(header.locator(".breadcrumb")).toHaveText("Home");
  await header.getByRole("button", { name: "Go forward", exact: true }).click();
  await expect(header.locator(".breadcrumb")).toHaveText("Discover");
  await page.setViewportSize({ width: 900, height: 650 });
  const brand = await header.locator(".topbar-brand").boundingBox();
  const status = await header.locator(".game-status").boundingBox();
  expect(brand && status && brand.x + brand.width <= status.x).toBeTruthy();
  await header.screenshot({ path: test.info().outputPath("topbar.png") });
});

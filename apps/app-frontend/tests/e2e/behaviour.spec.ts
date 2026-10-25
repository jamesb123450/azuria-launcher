import { test, expect } from "@playwright/test";
test("Behaviour stages edits, resets, persists and applies library defaults", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("azuria-preview-v1"))
      localStorage.setItem(
        "azuria-preview-v1",
        JSON.stringify({
          settings: { theme: "dark" },
          instances: [
            {
              id: "behaviour-instance",
              name: "Survival",
              loader: "vanilla",
              minecraftVersion: "1.21.1",
              memoryMb: 4096,
              favorite: false,
              createdAt: 1,
            },
          ],
        }),
      );
  });
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Behaviour", exact: true }).click();
  const minimise = dialog.getByRole("switch", {
    name: "Minimise when Minecraft starts",
    exact: true,
  });
  const refocus = dialog.getByRole("switch", {
    name: "Refocus after Minecraft closes",
    exact: true,
  });
  const sidebar = dialog.getByRole("switch", {
    name: "Hide the right sidebar by default",
    exact: true,
  });
  const compact = dialog.getByRole("switch", {
    name: "Compact library",
    exact: true,
  });
  await expect(dialog.getByText("Coming soon", { exact: true })).toHaveCount(0);
  await minimise.check();
  await refocus.check();
  await sidebar.check();
  await compact.check();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(minimise).not.toBeChecked();
  await expect(refocus).not.toBeChecked();
  await expect(sidebar).not.toBeChecked();
  await expect(compact).not.toBeChecked();
  await minimise.check();
  await refocus.check();
  await sidebar.check();
  await compact.check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Advertisements" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Friends & ads", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Advertisements" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Grid view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("complementary", { name: "Advertisements" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await dialog.getByRole("button", { name: "Behaviour", exact: true }).click();
  await expect(minimise).toBeChecked();
  await expect(refocus).toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: "Discord Rich Presence", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("behaviour.png") });
});
test("failed behaviour saves retain staged edits for retry", async ({
  page,
}) => {
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Behaviour", exact: true }).click();
  const compact = dialog.getByRole("switch", {
    name: "Compact library",
    exact: true,
  });
  await compact.check();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "azuria-behaviour-v1") {
        Storage.prototype.setItem = original;
        throw new Error("Storage unavailable");
      }
      return original.call(this, key, value);
    };
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Storage unavailable");
  await expect(compact).toBeChecked();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
});

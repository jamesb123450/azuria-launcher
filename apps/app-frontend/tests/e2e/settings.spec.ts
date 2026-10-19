import { expect, test } from "@playwright/test";
test("settings stage edits across categories, reset and persist only on Save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/#/settings");
  const popup = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(popup).toBeVisible();
  await expect(
    popup.getByRole("button", { name: "Light Use the light theme" }),
  ).toBeEnabled();
  const initialTheme = await page.locator("html").getAttribute("data-theme");
  await popup
    .getByRole("button", { name: "Light Use the light theme" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("azuria-preview-v1") || "{}").settings
          ?.theme,
    ),
  ).not.toBe("light");
  await popup
    .getByRole("button", { name: "Java & memory", exact: true })
    .click();
  await popup.getByLabel("Memory allocation in MB").fill("6144");
  await popup.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await popup.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(popup.getByLabel("Memory allocation in MB")).toHaveValue("4096");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    initialTheme!,
  );
  await popup.getByLabel("Memory allocation in MB").fill("6144");
  await popup.getByRole("button", { name: "Appearance", exact: true }).click();
  await popup
    .getByRole("button", { name: "Light Use the light theme" })
    .click();
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await popup.getByRole("button", { name: "Features", exact: true }).click();
  await expect(
    popup.getByText("Coming soon", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/settings-coming-soon.png" });
  await page.reload();
  await popup
    .getByRole("button", { name: "Java & memory", exact: true })
    .click();
  await expect(popup.getByLabel("Memory allocation in MB")).toHaveValue("6144");
  await popup.getByLabel("Memory allocation in MB").fill("0");
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await expect(popup.getByRole("alert")).toContainText("Memory must");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(popup).not.toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await popup
    .getByRole("button", { name: "Java & memory", exact: true })
    .click();
  await expect(popup.getByLabel("Memory allocation in MB")).toHaveValue("6144");
  await page.screenshot({ path: "test-results/settings-java-light.png" });
});
test("failed settings saves retain edits for retry", async ({ page }) => {
  await page.goto("/#/settings");
  const popup = page.getByRole("dialog", { name: "Settings", exact: true });
  await popup
    .getByRole("button", { name: "Java & memory", exact: true })
    .click();
  await popup.getByLabel("Memory allocation in MB").fill("8192");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "azuria-launch-defaults") {
        Storage.prototype.setItem = original;
        throw new Error("Storage unavailable");
      }
      return original.call(this, key, value);
    };
  });
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await expect(popup.getByRole("alert")).toContainText("Storage unavailable");
  await expect(popup.getByLabel("Memory allocation in MB")).toHaveValue("8192");
  await popup.getByRole("button", { name: "Save", exact: true }).click();
  await expect(popup.getByRole("status")).toHaveText("Settings saved.");
  await expect(
    popup.getByRole("button", { name: "Reset", exact: true }),
  ).toHaveCount(0);
});

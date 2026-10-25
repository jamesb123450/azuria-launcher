import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
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
              favorite: false,
              createdAt: 2,
            },
            {
              id: "creative",
              name: "Creative",
              loader: "fabric",
              minecraftVersion: "1.20.1",
              memoryMb: 6144,
              favorite: true,
              createdAt: 1,
            },
          ],
        }),
      );
  });
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
  await page.goto("/#/versions?tab=setups");
});
test("right-click targets the selected profile, clamps to viewport and requires confirmation to delete", async ({
  page,
}) => {
  const card = page.locator(".instance-card").filter({
    has: page.getByRole("heading", { name: "Survival", exact: true }),
  });
  await card.click({ button: "right" });
  const menu = page.getByRole("menu", {
    name: "Actions for Survival",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Profile sharing Coming soon" }),
  ).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath("context-menu.png"),
    animations: "disabled",
  });
  await menu
    .getByRole("menuitem", { name: "Delete profile…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Remove Survival?",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Keep instance" }),
  ).toBeFocused();
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page.screenshot({
    path: test.info().outputPath("delete-confirmation.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Keep instance" }).click();
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu
    .getByRole("menuitem", { name: "Delete profile…", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remove instance", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Creative", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".instance-card")).toHaveCount(1);
});
test("context actions support keyboard dismissal, pinning, copied settings review and export settings", async ({
  page,
}) => {
  const card = page.locator(".instance-card").filter({
    has: page.getByRole("heading", { name: "Survival", exact: true }),
  });
  await card.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", {
    name: "Actions for Survival",
    exact: true,
  });
  await expect(
    menu.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    menu.getByRole("menuitem", { name: "Delete profile…" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeFocused();
  await card.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Pin to top", exact: true }).click();
  await page.getByRole("button", { name: "Pinned 2", exact: true }).click();
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await card.click({ button: "right" });
  await menu
    .getByRole("menuitem", { name: "Copy from profile…", exact: true })
    .click();
  const copy = page.getByRole("dialog", {
    name: "Copy settings to Survival",
    exact: true,
  });
  await copy.getByRole("button", { name: "Review settings" }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit instance",
    exact: true,
  });
  await expect(editor.getByLabel("Instance name", { exact: true })).toHaveValue(
    "Survival",
  );
  await expect(
    editor.getByRole("button", { name: "Fabric", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await editor.getByRole("button", { name: "Close dialog" }).click();
  await card.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Export…", exact: true }).click();
  await expect(page).toHaveURL(/instances\/survival\?settings=export/);
  await expect(
    page.getByRole("dialog", { name: "Instance settings", exact: true }),
  ).toBeVisible();
});

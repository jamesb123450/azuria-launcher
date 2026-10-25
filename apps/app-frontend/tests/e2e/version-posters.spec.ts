import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({
      json: {
        versions: [
          { id: "26.3", type: "release" },
          { id: "26.2", type: "release" },
          { id: "1.21.1", type: "release" },
          { id: "1.21", type: "release" },
          { id: "1.20.1", type: "release" },
          { id: "1.19.4", type: "release" },
          { id: "1.18.2", type: "release" },
          { id: "1.17.1", type: "release" },
          { id: "1.16.5", type: "release" },
          { id: "1.15.2", type: "release" },
          { id: "1.14.4", type: "release" },
          { id: "1.13.2", type: "release" },
          { id: "1.12.2", type: "release" },
          { id: "24w14a", type: "snapshot" },
        ],
      },
    }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "azuria-preview-v1",
      JSON.stringify({ instances: [], settings: { theme: "dark" } }),
    ),
  );
});
test("Profiles replaces both former browsing catalogues", async ({ page }) => {
  for (const path of [
    "/versions",
    "/versions?tab=modpacks",
    "/versions?tab=setups",
  ]) {
    await page.goto("/#" + path);
    await expect(
      page.getByRole("heading", { name: "Profiles", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Version library")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New profile", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("group", { name: "Profile categories" })
        .getByRole("button", { name: /Modpacks/ }),
    ).toHaveCount(0);
  }
});
test("unsaved appearance previews the whole launcher and discard restores saved appearance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog
    .getByRole("button", { name: "Light Use the light theme" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("azuria-preview-v1")!).settings.theme,
    ),
  ).toBe("dark");
  await dialog.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

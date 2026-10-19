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
test("poster selection stays on Versions with patch and loader controls, art and a working launch action", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/versions");
  await expect(page.locator(".minecraft-version-card")).toHaveCount(11);
  await expect(page.locator(".version-context h2")).toHaveText("Minecraft 26");
  await page.getByLabel("Selected Minecraft release").selectOption("26.2");
  await page
    .getByRole("button", { name: "Choose Minecraft 1.21.1", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/versions$/);
  await expect(page.locator(".version-context h2")).toHaveText(
    "Minecraft 1.21",
  );
  await page.getByLabel("Selected Minecraft release").selectOption("1.21");
  await page
    .getByRole("group", { name: "Versions mod loader" })
    .getByRole("button", { name: "Fabric", exact: true })
    .click();
  await page.getByRole("button", { name: "Launch game", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "browser preview cannot launch",
  );
  await expect(page.locator(".version-context-art img")).toHaveJSProperty(
    "naturalWidth",
    540,
  );
  for (const width of [900, 1024, 1280, 1588]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const panel = await page.locator(".version-context").boundingBox();
    const grid = await page.locator(".versions-catalogue").boundingBox();
    expect(grid!.x + grid!.width).toBeLessThanOrEqual(panel!.x);
    const launch = await page
      .locator(".version-launch-row .launch-main")
      .boundingBox();
    expect(launch!.x + launch!.width).toBeLessThanOrEqual(
      panel!.x + panel!.width,
    );
  }
  await page.screenshot({
    path: test.info().outputPath("versions-premium.png"),
  });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator(".launch-main")).toContainText(
    "Minecraft 1.21 · Fabric",
  );
  await expect(
    page.getByRole("link", { name: "Development information" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Home", exact: true }).locator("svg"),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("poster catalogue filters patches and snapshots without losing the selected launch context", async ({
  page,
}) => {
  await page.goto("/#/versions");
  await page.getByLabel("Search Minecraft versions").fill("1.21.1");
  await expect(page.locator(".minecraft-version-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Choose Minecraft 1.21.1", exact: true })
    .click();
  await expect(page.getByLabel("Selected Minecraft release")).toHaveValue(
    "1.21.1",
  );
  await page.getByLabel("Search Minecraft versions").fill("nothing");
  await expect(
    page.getByRole("heading", { name: "No matching versions" }),
  ).toBeVisible();
  await expect(page.locator(".version-context h2")).toHaveText(
    "Minecraft 1.21",
  );
  await page.getByLabel("Search Minecraft versions").fill("24w14a");
  await page.getByLabel("Include snapshots & older builds").check();
  await page.getByRole("button", { name: "Choose Minecraft 24w14a" }).click();
  await expect(page.locator(".version-context h2")).toHaveText(
    "Minecraft 24w14a",
  );
  await expect(page.locator(".version-context-copy")).toContainText(
    "keep backups",
  );
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

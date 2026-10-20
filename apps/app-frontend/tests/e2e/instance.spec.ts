import { test, expect } from "@playwright/test";
const id = "80f8b85f-0a61-42c4-90b5-3b32a01f49ff";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ id }) => {
      if (!localStorage.getItem("azuria-preview-v1"))
        localStorage.setItem(
          "azuria-preview-v1",
          JSON.stringify({
            instances: [
              {
                id,
                name: "Aurora",
                loader: "fabric",
                minecraftVersion: "1.21.1",
                loaderVersion: "0.16.10",
                memoryMb: 4096,
                favorite: false,
                createdAt: 1,
              },
            ],
            settings: { theme: "dark" },
          }),
        );
    },
    { id },
  );
});
test("instance navigation, general settings, defaults and overrides persist", async ({
  page,
}) => {
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("button", { name: "Open Aurora", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aurora", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Launch unavailable" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Upload files" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Worlds", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No worlds yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Logs are available in the desktop app",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Instance name", { exact: true })
    .fill("Aurora renamed");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.locator(".instance-feedback")).toContainText(
    "Instance details saved",
  );
  await page
    .getByRole("button", { name: "Java Environment", exact: true })
    .click();
  await page.getByLabel("Memory allocation in MB").fill("8192");
  await page.getByRole("button", { name: "Save overrides" }).click();
  await expect(page.locator(".instance-feedback")).toContainText(
    "Overrides saved",
  );
  await page.getByRole("button", { name: "Close instance settings" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Java Environment", exact: true })
    .click();
  await expect(page.getByLabel("Memory allocation in MB")).toHaveValue("8192");
  await page
    .getByRole("switch", { name: "Custom memory allocation", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Save overrides" }).click();
  await expect(
    page.getByText("Using launcher default: 4096 MB", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Launcher defaults", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Settings", exact: true })
    .getByLabel("Memory allocation in MB")
    .fill("6144");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Settings", exact: true })
      .getByRole("status"),
  ).toContainText("Settings saved");
  await page.goto(`/#/instances/${id}/settings/overrides`);
  await expect(
    page.getByText("Using launcher default: 6144 MB", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Instance settings" }),
  ).toBeVisible();
});
test("settings guard unsaved changes and duplicate into a separate instance", async ({
  page,
}) => {
  await page.goto(`/#/instances/${id}/settings/general`);
  await page.getByLabel("Instance name", { exact: true }).fill("Unsaved");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Close instance settings", exact: true })
    .click();
  await expect(page.getByLabel("Instance name", { exact: true })).toHaveValue(
    "Unsaved",
  );
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page
    .getByRole("button", { name: "Duplicate instance", exact: true })
    .click();
  await page.getByRole("button", { name: "Create duplicate" }).click();
  await expect(
    page.getByRole("heading", { name: "Aurora copy", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(id));
});
test("minimum window settings fit and missing instances have an exit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto(`/#/instances/${id}/settings/overrides`);
  await expect(
    page.getByRole("heading", { name: "Java Environment", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("instance-settings-dark.png"),
    fullPage: true,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.screenshot({
    path: test.info().outputPath("instance-settings-light.png"),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/#/instances/${id}`);
  await expect(
    page.getByText(
      "No additional content. Upload files or browse Discover to add some.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("instance-content.png"),
  });
  await page.goto("/#/instances/missing");
  await expect(
    page.getByRole("heading", { name: "Instance not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to saved setups" }),
  ).toBeVisible();
});

test("icon studio offers distinct symbols and finishes and saves the chosen icon", async ({
  page,
}) => {
  await page.goto(`/#/instances/${id}`);
  const trigger = page.getByRole("button", { name: "Settings", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Instance settings",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const symbols = dialog.getByRole("group", { name: "Icon symbol" });
  await expect(symbols.getByRole("button")).toHaveCount(9);
  const previews = new Set<string>();
  for (const button of await symbols.getByRole("button").all()) {
    await button.click();
    previews.add(
      (await dialog.locator(".icon-studio-preview img").getAttribute("src")) ??
        "",
    );
  }
  expect(previews.size).toBe(9);
  const backgrounds = dialog.getByRole("group", { name: "Icon background" });
  const finishes = new Set<string>();
  for (const button of await backgrounds.getByRole("button").all()) {
    await button.click();
    finishes.add(
      (await dialog.locator(".icon-studio-preview img").getAttribute("src")) ??
        "",
    );
  }
  expect(finishes.size).toBe(4);
  await page.screenshot({
    path: test.info().outputPath("instance-icon-studio.png"),
  });
  const selected = await dialog
    .locator(".icon-studio-preview img")
    .getAttribute("src");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await dialog.getByRole("button", { name: "Close instance settings" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.locator(".icon-studio-preview img")).toHaveAttribute(
    "src",
    selected!,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("navigation highlights only the current page and screenshot tab matches its peers", async ({
  page,
}) => {
  await page.goto("/#/versions?tab=setups");
  const library = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Versions", exact: true });
  const quick = page.locator(".instance-card").getByRole("link").first();
  await expect(library).toHaveClass(/router-link-exact-active/);

  await page.goto(`/#/instances/${id}`);

  await expect(library).not.toHaveClass(/router-link-exact-active/);
  const tabs = page.getByRole("navigation", { name: "Instance sections" });
  const content = tabs.getByRole("button", { name: "Content", exact: true });
  const shots = tabs.getByRole("link", { name: "Screenshots", exact: true });
  expect(await shots.evaluate((e) => getComputedStyle(e).fontWeight)).toBe(
    await content.evaluate((e) => getComputedStyle(e).fontWeight),
  );
  await expect(shots.locator("svg")).toHaveCount(1);
  await shots.click();
  await expect(
    page.getByRole("link", { name: "Screenshots", exact: true }),
  ).toHaveClass(/router-link-exact-active/);

  await library.click();
});
test("community sidebar has friends coming soon and two square ad slots", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", {
    name: "Friends and advertisements",
  });
  await expect(sidebar.getByText("Coming soon", { exact: true })).toBeVisible();
  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const slot of [1, 2]) {
      const ad = sidebar.getByRole("region", {
        name: `Advertisement slot ${slot}`,
      });
      const box = await ad.boundingBox();
      expect(Math.abs(box!.height - box!.width)).toBeLessThan(2);
    }
  }
});

test("profile popup keeps notes and exports only portable setup preferences", async ({
  page,
}) => {
  await page.goto(`/#/instances/${id}?settings=notes`);
  const popup = page.getByRole("dialog", {
    name: "Instance settings",
    exact: true,
  });
  await popup
    .getByLabel("Instance notes", { exact: true })
    .fill("# My world\nRemember the village.");
  await popup.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.locator(".instance-feedback")).toContainText("Notes saved");
  await page.reload();
  await expect(popup.getByLabel("Instance notes", { exact: true })).toHaveValue(
    "# My world\nRemember the village.",
  );
  await popup.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await popup
    .getByRole("button", { name: "Export instance", exact: true })
    .click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const data = JSON.parse(Buffer.concat(chunks).toString());
  expect(data.format).toBe("azuria-setup");
  expect(data.instance.id).toBe(id);
  expect(Object.keys(data.overrides)).toEqual(["memoryMb"]);
  await popup.getByLabel("Export format").selectOption("folder");
  await expect(
    popup.getByRole("button", { name: "Export instance", exact: true }),
  ).toBeDisabled();
  await popup
    .getByRole("button", { name: "Java Environment", exact: true })
    .click();
  await popup
    .getByRole("switch", { name: "Custom memory allocation", exact: true })
    .uncheck();
  await expect(popup.getByLabel("Memory allocation in MB")).toBeDisabled();
  await expect(popup.locator(".memory-controls")).toHaveClass(
    /inherited-preview/,
  );
  await popup
    .getByRole("switch", { name: "Custom memory allocation", exact: true })
    .check();
  await expect(popup.getByLabel("Memory allocation in MB")).toBeEnabled();
});

test("Home launch arrow and hero settings route to saved setups and memory", async ({
  page,
}) => {
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({ json: { versions: [{ id: "1.21.1", type: "release" }] } }),
  );
  await page.goto("/");
  await page
    .getByRole("link", { name: "Open Minecraft versions", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/versions$/);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("button", { name: "Launch settings", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /Global settings/ }).click();
  await expect(page).toHaveURL(/settings#launch-defaults/);
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Launch settings", exact: true })
    .click();
  await page.getByRole("menuitem", { name: /Profile settings/ }).click();
  await expect(page).toHaveURL(/instances\/[^?]+\?settings=java/);
  await expect(
    page
      .getByRole("dialog", { name: "Instance settings", exact: true })
      .getByRole("heading", { name: "Java Environment", exact: true }),
  ).toBeVisible();
});

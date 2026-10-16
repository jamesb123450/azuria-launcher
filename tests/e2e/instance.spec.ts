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
  await page.goto("/");
  await page.getByRole("button", { name: "Open Aurora", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aurora", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Launch unavailable" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Import file" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Worlds", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No worlds yet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No game logs yet" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Settings", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Instance name", { exact: true })
    .fill("Aurora renamed");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Instance details saved",
  );
  await page.getByRole("link", { name: "Overrides", exact: true }).click();
  await page.getByLabel("Memory allocation in MB").fill("8192");
  await page.getByRole("button", { name: "Save overrides" }).click();
  await expect(page.getByRole("status")).toContainText("Overrides saved");
  await page.reload();
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
  await page.getByLabel("Memory allocation in MB").fill("6144");
  await page.getByRole("button", { name: "Save game defaults" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Launcher defaults saved",
  );
  await page.goto(`/#/instances/${id}/settings/overrides`);
  await expect(
    page.getByText("Using launcher default: 6144 MB", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aurora renamed / Settings" }),
  ).toBeVisible();
});
test("settings guard unsaved changes and duplicate into a separate instance", async ({
  page,
}) => {
  await page.goto(`/#/instances/${id}/settings/general`);
  await page.getByLabel("Instance name", { exact: true }).fill("Unsaved");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("link", { name: "Back to instance", exact: true })
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
    page.getByRole("heading", { name: "Overrides", exact: true }),
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
    page.getByRole("heading", { name: "No content added yet" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("instance-content.png"),
  });
  await page.goto("/#/instances/missing");
  await expect(
    page.getByRole("heading", { name: "Instance not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to Library" }),
  ).toBeVisible();
});

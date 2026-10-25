import { test, expect } from "@playwright/test";
test("profile management uses a left summary, inline settings and a coming-soon Share tab", async ({
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
              id: "survival",
              name: "Survival",
              loader: "fabric",
              minecraftVersion: "1.21.1",
              memoryMb: 4096,
              favorite: false,
              createdAt: 1,
            },
          ],
        }),
      );
  });
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({ json: { versions: [{ id: "1.21.1", type: "release" }] } }),
  );
  await page.setViewportSize({ width: 1588, height: 1000 });
  await page.goto("/#/instances/survival");
  await expect(
    page.getByRole("button", { name: "Share Coming soon", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Content", exact: true }),
  ).toBeVisible();
  const summary = await page
    .getByRole("complementary", { name: "Instance launch controls" })
    .boundingBox();
  const main = await page.locator(".instance-main").boundingBox();
  expect(summary!.x + summary!.width).toBeLessThan(main!.x);
  await page.screenshot({
    path: test.info().outputPath("profile-content.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", {
    name: "Instance settings",
    exact: true,
  });
  await expect(settings).toHaveAttribute("aria-modal", "false");
  await expect(
    settings.getByRole("button", { name: "General", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("profile-settings.png"),
    animations: "disabled",
  });
  await settings
    .getByLabel("Instance name", { exact: true })
    .fill("My survival world");
  await settings
    .getByRole("button", { name: "Save details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My survival world", exact: true }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "Window", exact: true }).click();
  await expect(
    settings.getByRole("heading", { name: "Window", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("profile-window-settings.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My survival world", exact: true }),
  ).toBeVisible();
});

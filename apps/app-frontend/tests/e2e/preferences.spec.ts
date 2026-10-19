import { expect, test } from "@playwright/test";
test("privacy and OLED persist, actions only appear for edits, sidebar version stays visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/#/settings");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveCount(0);
  await expect(dialog.locator(".settings-version")).toBeVisible();
  await dialog.getByRole("button", { name: "Privacy", exact: true }).click();
  const reconnect = dialog.getByRole("switch", {
    name: "Reconnect account on startup",
  });
  const hidden = dialog.getByRole("switch", { name: "Hide account details" });
  await reconnect.uncheck();
  await hidden.check();
  await expect(save).toBeVisible();
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(reconnect).toBeChecked();
  await expect(hidden).not.toBeChecked();
  await expect(save).toHaveCount(0);
  await reconnect.uncheck();
  await hidden.check();
  await dialog
    .getByRole("switch", { name: "Discord Rich Presence", exact: true })
    .uncheck();
  await save.click();
  await expect(save).toHaveCount(0);
  await dialog.getByRole("button", { name: "Appearance", exact: true }).click();
  await dialog.getByRole("button", { name: "OLED Use the oled theme" }).click();
  await save.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "oled");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await page.reload();
  await dialog.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(reconnect).not.toBeChecked();
  await expect(hidden).toBeChecked();
  await dialog.getByRole("button", { name: "Behaviour", exact: true }).click();
  await expect(
    dialog.getByRole("switch", { name: "Discord Rich Presence", exact: true }),
  ).not.toBeChecked();
  const version = await dialog.locator(".settings-version").boundingBox();
  const box = await dialog.boundingBox();
  expect(
    version && box && version.y + version.height <= box.y + box.height,
  ).toBeTruthy();
  await dialog.screenshot({
    path: test.info().outputPath("oled-preferences.png"),
  });
});
test("memory controls use the detected limit rather than a fixed 64 GiB", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "deviceMemory", { get: () => 128 }),
  );
  await page.goto("/#/settings");
  const d = page.getByRole("dialog", { name: "Settings", exact: true });
  await d.getByRole("button", { name: "Java & memory", exact: true }).click();
  await expect(
    d.getByRole("slider", { name: "Memory allocation slider" }),
  ).toHaveAttribute("max", "131072");
  await d.getByLabel("Memory allocation in MB").fill("98304");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d.getByText("Settings saved.", { exact: true })).toBeVisible();
  await d.getByLabel("Memory allocation in MB").fill("131328");
  await d.getByRole("button", { name: "Save", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("memory limit");
});
test("startup displays a loader until storage is ready without inventing migration", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.assign(window, {
      isTauri: true,
      __TAURI_INTERNALS__: {
        transformCallback: () => 1,
        invoke: async (cmd: string) => {
          if (cmd === "storage_migration_needed") return false;
          if (cmd === "prepare_storage") {
            await new Promise((r) => setTimeout(r, 800));
            return { required: false };
          }
          if (cmd === "list_instances") return [];
          if (cmd === "get_settings") return { theme: "dark" };
          if (cmd === "game_launches") return [];
          if (cmd === "get_privacy")
            return { restoreAccount: false, hideAccount: false };
          if (cmd === "account_status")
            return {
              supported: false,
              verified: false,
              account: null,
              hasSavedSession: false,
            };
          return null;
        },
      },
    }),
  );
  await page.goto("/#/versions?tab=setups");
  await expect(
    page.getByRole("status", { name: "Starting Azuria" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Migrating data", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("status", { name: "Starting Azuria" }),
  ).toHaveCount(0);
  await expect(page.locator(".topbar")).toBeVisible();
});

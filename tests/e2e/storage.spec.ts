import { test, expect } from "@playwright/test";
test("storage preferences save and reset inside the settings popup", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(
    dialog.getByText(
      "Real disk usage and cleanup are available in the Windows app.",
    ),
  ).toBeVisible();
  const limit = dialog.getByLabel("Maximum concurrent downloads", {
    exact: true,
  });
  await expect(limit).toHaveValue("8");
  await limit.fill("2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await limit.fill("4");
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(limit).toHaveValue("2");
  await page.reload();
  await dialog.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(limit).toHaveValue("2");
});

test("native storage shows measured categories and confirms cleanup before invoking it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let cleaned = false;
    const calls: string[] = [];
    Object.assign(window, {
      isTauri: true,
      storageCalls: calls,
      __TAURI_INTERNALS__: {
        transformCallback: () => 1,
        invoke: async (cmd: string) => {
          calls.push(cmd);
          if (cmd === "storage_migration_needed") return false;
          if (cmd === "prepare_storage")
            return {
              required: false,
              instancesPath: "C:\\AzuriaLauncher\\instances",
              migratedInstances: 0,
            };
          if (cmd === "list_instances") return [];
          if (cmd === "get_settings") return { theme: "dark" };
          if (cmd === "account_status")
            return {
              supported: false,
              account: null,
              verified: false,
              hasSavedSession: false,
            };
          if (cmd === "plugin:app|version") return "0.2.140";
          if (cmd === "get_launch_defaults")
            return {
              memoryMb: 4096,
              javaPath: null,
              javaArguments: [],
              environment: {},
              window: { fullscreen: false, width: 1280, height: 720 },
            };
          if (cmd === "resource_options")
            return { unusedDownloadGib: 0, concurrentDownloads: 4 };
          if (cmd === "storage_usage")
            return {
              token: 1,
              usage: {
                directory: "C:\\Users\\Test\\AppData\\Roaming\\AzuriaLauncher",
                totalBytes: 10485760,
                categories: [
                  { name: "Instance · Survival", bytes: 5242880 },
                  { name: "Shared game files", bytes: 4194304 },
                  { name: "Unused downloads", bytes: 1048576 },
                ],
                cleanupBytes: cleaned ? 0 : 1048576,
                cleanupFiles: cleaned ? 0 : 2,
                skipped: 0,
              },
            };
          if (cmd === "storage_cleanup") {
            cleaned = true;
            return 1048576;
          }
          return null;
        },
      },
    });
  });
  await page.goto("/#/settings");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Storage", exact: true }).click();
  await expect(
    dialog.getByText("Instance · Survival", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Clean up 1 MiB", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { storageCalls: string[] }).storageCalls.includes(
        "storage_cleanup",
      ),
    ),
  ).toBe(false);
  await dialog
    .getByRole("button", { name: "Confirm cleanup", exact: true })
    .click();
  await expect(
    dialog.getByText("Removed 1 MiB of abandoned downloads.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Clean up 0 B", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath("storage.png") });
});

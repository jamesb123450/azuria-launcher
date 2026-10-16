import { expect, test, type Page } from "@playwright/test";

async function mockStorage(page: Page, failPrepare = false) {
  await page.addInitScript(
    ({ failPrepare }) => {
      const report = {
        required: true,
        instancesPath:
          "C:\\Users\\Player\\AppData\\Roaming\\AzuriaLauncher\\instances",
        migratedInstances: 2,
        backupPath: "C:\\Users\\Player\\AppData\\Local\\com.azuria.launcher",
      };
      const commands: string[] = [];
      Object.assign(window, {
        isTauri: true,
        storageCommands: commands,
        __TAURI_INTERNALS__: {
          invoke: async (cmd: string) => {
            commands.push(cmd);
            if (cmd === "storage_migration_needed")
              return !sessionStorage.getItem("acknowledged");
            if (cmd === "prepare_storage") {
              if (failPrepare && !sessionStorage.getItem("prepareRetried")) {
                sessionStorage.setItem("prepareRetried", "true");
                throw "Close other Azuria windows and retry the migration.";
              }
              if (sessionStorage.getItem("acknowledged"))
                return { ...report, required: false };
              if (!sessionStorage.getItem("prepared")) {
                return new Promise((resolve) =>
                  Object.assign(window, {
                    completeMigration: () => {
                      sessionStorage.setItem("prepared", "true");
                      resolve(report);
                    },
                  }),
                );
              }
              return report;
            }
            if (cmd === "open_instances_folder") {
              if (!sessionStorage.getItem("folderRetried")) {
                sessionStorage.setItem("folderRetried", "true");
                throw "Could not open the instances folder.";
              }
              return;
            }
            if (cmd === "confirm_storage_migration") {
              sessionStorage.setItem("acknowledged", "true");
              return;
            }
            if (cmd === "list_instances") return [];
            if (cmd === "get_settings") return { theme: "dark" };
            if (cmd === "account_status")
              return {
                supported: false,
                verified: false,
                account: null,
                hasSavedSession: false,
              };
            if (cmd === "plugin:app|version") return "0.2.99";
            if (cmd === "plugin:updater|check") return null;
            throw new Error(`Unexpected command: ${cmd}`);
          },
        },
      });
    },
    { failPrepare },
  );
}

test("migration requires confirmation while opening the folder is optional", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await mockStorage(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Migrating data", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { storageCommands: string[] }).storageCommands,
    ),
  ).toEqual(["storage_migration_needed", "prepare_storage"]);
  await page.evaluate(() =>
    (
      window as unknown as { completeMigration: () => void }
    ).completeMigration(),
  );
  const confirm = dialog.getByRole("button", {
    name: "Confirm and continue",
    exact: true,
  });
  await expect(confirm).toBeFocused();
  await expect(confirm).toBeInViewport();
  await expect(dialog).toContainText("2 instances migrated");
  await page.screenshot({ path: "test-results/migration-complete-900.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Open instances folder", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not open the instances folder.",
  );
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm and continue", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { storageCommands: string[] }).storageCommands,
    ),
  ).not.toContain("open_instances_folder");
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("migration failure stays gated and supports retry", async ({ page }) => {
  await mockStorage(page, true);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText(
    "Close other Azuria windows",
  );
  await expect(
    dialog.getByRole("button", {
      name: "Confirm and continue",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "test-results/migration-error.png" });
  await dialog
    .getByRole("button", { name: "Retry migration", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Migrating data", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { completeMigration: () => void }
    ).completeMigration(),
  );
  await expect(
    dialog.getByRole("button", {
      name: "Confirm and continue",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.locator(".app-shell")).toHaveCount(0);
});

test("acknowledged launches never open the migration modal even during slow storage startup", async ({
  page,
}) => {
  await mockStorage(page);
  await page.addInitScript(() => {
    sessionStorage.setItem("acknowledged", "true");
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke;
    internals.invoke = async (cmd) => {
      if (cmd === "prepare_storage")
        await new Promise((resolve) => setTimeout(resolve, 200));
      return original(cmd);
    };
    const opened: string[] = [];
    Object.assign(window, { migrationModals: opened });
    const nativeShow = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      if (this.classList.contains("storage-migration")) opened.push("opened");
      return nativeShow.call(this);
    };
  });
  for (let start = 0; start < 3; start++) {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Library", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { migrationModals: string[] }).migrationModals,
      ),
    ).toEqual([]);
  }
});

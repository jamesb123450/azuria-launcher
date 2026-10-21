import { test, expect } from "@playwright/test";
async function setup(page: import("@playwright/test").Page, fail = false) {
  await page.addInitScript(
    ({ fail }) => {
      const commands: string[] = [];
      Object.assign(window, {
        isTauri: true,
        updateCommands: commands,
        __TAURI_INTERNALS__: {
          transformCallback: () => 1,
          invoke: async (
            cmd: string,
            args?: { onEvent?: { onmessage: (event: unknown) => void } },
          ) => {
            commands.push(cmd);
            if (cmd === "game_launches") return [];
            if (cmd === "plugin:event|listen") return 1;
            if (cmd === "plugin:event|unlisten") return;
            if (cmd === "storage_migration_needed") return false;
            if (cmd === "prepare_storage")
              return {
                required: false,
                instancesPath: "C:\\AzuriaLauncher\\instances",
                migratedInstances: 0,
              };
            if (cmd === "list_instances") return [];
            if (cmd === "get_settings") return { theme: "dark" };
            if (cmd === "get_launch_defaults")
              return {
                memoryMb: 4096,
                javaPath: null,
                javaArguments: [],
                environment: {},
                window: { fullscreen: false, width: 1280, height: 720 },
              };
            if (cmd === "account_status")
              return {
                supported: false,
                verified: false,
                account: null,
                hasSavedSession: false,
              };
            if (cmd === "plugin:app|version") return "0.2.99";
            if (cmd === "plugin:updater|check")
              return {
                rid: 1,
                version: "0.2.100",
                currentVersion: "0.2.99",
                body: "A polished update\n• Better instances",
                rawJson: {},
              };
            if (cmd === "plugin:updater|download") {
              args?.onEvent?.onmessage({
                event: "Started",
                data: { contentLength: 10485760 },
              });
              args?.onEvent?.onmessage({
                event: "Progress",
                data: { chunkLength: 5242880 },
              });
              return new Promise((resolve, reject) =>
                Object.assign(window, {
                  finishDownload: () => {
                    if (fail) reject("signature verification failed");
                    else {
                      args?.onEvent?.onmessage({
                        event: "Progress",
                        data: { chunkLength: 5242880 },
                      });
                      args?.onEvent?.onmessage({ event: "Finished" });
                      resolve(2);
                    }
                  },
                }),
              );
            }
            if (cmd === "plugin:updater|install") return;
            if (cmd === "plugin:resources|close") return;
            throw Error(`Unexpected: ${cmd}`);
          },
        },
      });
    },
    { fail },
  );
}
test("automatically downloads, shows progress and can postpone or restart", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", {
    name: "Automatic launcher update",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute("value", "50");
  await expect(dialog.getByText("5.0 MB of 10.0 MB")).toBeVisible();
  await dialog.getByText("What’s new in 0.2.100").click();
  await expect(
    dialog.getByText("A polished update", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("update-downloading.png"),
  });
  await page.evaluate(() =>
    (window as unknown as { finishDownload: () => void }).finishDownload(),
  );
  await expect(
    dialog.getByRole("button", { name: "Restart & install" }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("update-ready.png") });
  await dialog.getByRole("button", { name: "Later", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check for updates" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Restart & install" }).click();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { updateCommands: string[] }
        ).updateCommands.filter((c) => c === "plugin:updater|install").length,
    ),
  ).toBe(1);
});
test("installs automatically when the restart countdown expires", async ({
  page,
}) => {
  await page.clock.install();
  await setup(page);
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Automatic launcher update" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { finishDownload: () => void }).finishDownload(),
  );
  await expect(
    page.getByText("Restarting to install in 15 seconds"),
  ).toBeVisible();
  await page.clock.runFor(15000);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { updateCommands: string[] }
      ).updateCommands.includes("plugin:updater|install"),
    ),
  ).toBe(true);
});
test("signature failures leave the launcher usable and never run the installer", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Automatic launcher update" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { finishDownload: () => void }).finishDownload(),
  );
  await expect(
    page.getByRole("dialog", { name: "Automatic launcher update" }),
  ).not.toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Updates", exact: true }).click();
  await expect(
    page.getByLabel("Updates", { exact: true }).getByRole("alert"),
  ).toContainText("could not be downloaded or verified");
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { updateCommands: string[] }
      ).updateCommands.includes("plugin:updater|install"),
    ),
  ).toBe(false);
});

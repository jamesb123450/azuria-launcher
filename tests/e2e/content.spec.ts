import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.addInitScript(() => {
    let sequence = 0,
      configured = false;
    const callbacks: Record<number, (event: unknown) => void> = {};
    const handlers: Record<string, number> = {};
    const calls: { cmd: string; args: any }[] = [];
    const target = {
      minecraft: "1.21.1",
      loader: "fabric",
      loaderVersion: "0.16.10",
    };
    const emit = (event: string, payload: unknown) =>
      callbacks[handlers[event]!]?.({ event, id: 1, payload });
    Object.assign(window, {
      isTauri: true,
      contentCalls: calls,
      __TAURI_INTERNALS__: {
        transformCallback: (callback: (event: unknown) => void) => {
          callbacks[++sequence] = callback;
          return sequence;
        },
        invoke: async (cmd: string, args?: any) => {
          calls.push({ cmd, args });
          if (cmd === "storage_migration_needed") return false;
          if (cmd === "prepare_storage")
            return {
              required: false,
              instancesPath: "C:\\AzuriaLauncher\\instances",
              migratedInstances: 0,
            };
          if (cmd === "list_instances")
            return [
              {
                id: "fabric",
                name: "Fabric instance",
                loader: "fabric",
                loaderVersion: "0.16.10",
                minecraftVersion: "1.21.1",
                memoryMb: 4096,
                favorite: false,
                createdAt: 1,
              },
            ];
          if (cmd === "get_settings") return { theme: "dark" };
          if (cmd === "account_status")
            return {
              supported: false,
              account: null,
              verified: false,
              hasSavedSession: false,
            };
          if (cmd === "plugin:app|version") return "0.2.100";
          if (cmd === "plugin:updater|check" || cmd === "content_job")
            return null;
          if (cmd === "plugin:event|listen") {
            handlers[args.event] = args.handler;
            return sequence;
          }
          if (cmd === "plugin:event|unlisten") return;
          if (cmd === "game_launches") return [];
          if (cmd === "get_launch_defaults")
            return {
              memoryMb: 4096,
              javaPath: null,
              javaArguments: [],
              environment: {},
              window: { fullscreen: false, width: 1280, height: 720 },
            };
          if (cmd === "save_settings" || cmd === "set_launch_defaults") return;
          if (cmd === "content_status")
            return { curseforgeConfigured: configured };
          if (cmd === "content_set_curseforge_key") {
            configured = !!args.key;
            return;
          }
          if (cmd === "content_search") {
            if (args.query.provider === "curseforge" && !configured)
              throw "Configure CurseForge API access in Settings.";
            return {
              total: 1,
              projects: [
                {
                  id: "project",
                  name: "Test project",
                  description: "Provider fixture",
                  author: "Author",
                  url: "https://modrinth.com/mod/project",
                  downloads: 100,
                  categories: ["optimization"],
                },
              ],
            };
          }
          if (cmd === "content_versions")
            return [
              {
                id: "version",
                name: "Compatible release",
                gameVersions: ["1.21.1"],
                loaders: ["fabric"],
                releaseType: "release",
              },
            ];
          if (cmd === "instance_entries")
            return [{ name: "My World", directory: true, size: 0 }];
          if (cmd === "content_plan")
            return {
              id: "plan",
              preview: {
                files: 2,
                bytes: 2048,
                names: ["Main file", "Required library"],
                target,
              },
            };
          if (cmd === "content_install") {
            emit("content-progress", {
              id: "plan",
              stage: "installed",
              message: "Content installed successfully.",
              completed: 2048,
              total: 2048,
            });
            emit("content-installed", {});
            return;
          }
          throw `Unexpected command: ${cmd}`;
        },
      },
    });
  });
  await page.route("https://piston-meta.mojang.com/**", (route) =>
    route.fulfill({ json: { versions: [] } }),
  );
  await page.goto("/#/discover");
}
test("compatible mod install requires a reviewed native plan", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Mods", exact: true }).click();
  await page
    .getByRole("button", { name: "Install Test project", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Content version" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).contentCalls.some(
        (c: any) => c.cmd === "content_install",
      ),
    ),
  ).toBe(false);
  await dialog.getByRole("button", { name: "Review installation" }).click();
  await expect(dialog.getByText("Required library")).toBeVisible();
  await dialog.getByRole("button", { name: "Install 2 files" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Content installed successfully.")).toBeVisible();
  const plans = await page.evaluate(() =>
    (window as any).contentCalls.filter((c: any) => c.cmd === "content_plan"),
  );
  expect(plans[0].args).toMatchObject({
    instanceId: "fabric",
    version: "version",
    kind: "mods",
  });
});
test("modpacks create a new instance and datapacks select a world", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Install Test project", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("New instance name").fill("My pack");
  await dialog.getByRole("button", { name: "Review installation" }).click();
  await expect(dialog.getByText("Ready to install")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Datapacks", exact: true }).click();
  await page
    .getByRole("button", { name: "Install Test project", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Install datapack into world" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Review installation" }).click();
  await expect(dialog.getByText("Ready to install")).toBeVisible();
  const plans = await page.evaluate(() =>
    (window as any).contentCalls.filter((c: any) => c.cmd === "content_plan"),
  );
  expect(plans[0].args).toMatchObject({
    instanceId: null,
    name: "My pack",
    kind: "modpacks",
  });
  expect(plans[1].args).toMatchObject({
    instanceId: "fabric",
    world: "My World",
    kind: "datapacks",
  });
  expect(
    await page.evaluate(() =>
      (window as any).contentCalls.some(
        (c: any) => c.cmd === "launch_instance",
      ),
    ),
  ).toBe(false);
});
test("provider settings stage and reset API key changes before saving", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/settings#content-providers");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("API key", { exact: true }).fill("test-fixture-key");
  await dialog.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
  expect(
    await page.evaluate(() =>
      (window as any).contentCalls.some(
        (c: any) => c.cmd === "content_set_curseforge_key",
      ),
    ),
  ).toBe(false);
  await dialog.getByLabel("API key", { exact: true }).fill("test-fixture-key");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText(
      "A key is stored in Windows Credential Manager on this PC.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Replacement API key", { exact: true }),
  ).toHaveValue("");
});

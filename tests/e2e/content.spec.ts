import { test, expect, type Page } from "@playwright/test";
async function setup(page: Page, mode = "default") {
  await page.addInitScript((mode) => {
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
                loader: mode === "vanilla" ? "vanilla" : "fabric",
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
          if (cmd === "content_job")
            return mode === "active"
              ? {
                  id: "plan",
                  stage: "downloading",
                  message: "Downloading and verifying content",
                  completed: 100,
                  total: 1000,
                }
              : null;
          if (cmd === "content_cancel") {
            emit("content-progress", {
              id: "plan",
              stage: "cancelled",
              message: "Installation cancelled.",
              completed: 0,
              total: 1000,
            });
            return;
          }
          if (cmd === "plugin:updater|check") return null;
          const project = {
            id: "project",
            name: "Test project",
            description: "Provider fixture",
            author: "Author",
            url: "https://modrinth.com/mod/project",
            downloads: 100,
            categories: ["optimization"],
            iconUrl: "https://cdn.modrinth.com/data/project/icon.png",
          };
          const addon = { ...project, id: "addon", name: "Extra mod" };
          if (cmd === "content_project")
            return {
              project,
              body: '# Provider description\n\nThis is **fetched content**. <img src=x onerror="window.badDescription=true"><script>window.badDescription=true</script>',
              bodyHtml: false,
              followers: 500,
              gallery: [
                {
                  url: "https://cdn.modrinth.com/data/project/images/gallery.png",
                  title: "In-game view",
                  description: "A published gallery image.",
                },
              ],
            };
          if (cmd === "content_inventory")
            return mode === "pack"
              ? {
                  pack: {
                    provider: "modrinth",
                    project,
                    kind: "modpacks",
                    version: "old",
                    versionName: "Pack 1.0",
                    latest: "new",
                    missing: 1,
                    mods: 1,
                    resourcePacks: 0,
                    files: ["mods/pack.jar"],
                  },
                  projects: [
                    {
                      provider: "modrinth",
                      project: addon,
                      kind: "mods",
                      version: "a1",
                      versionName: "Extra 1.0",
                      latest: "a2",
                      missing: 0,
                      mods: 1,
                      resourcePacks: 0,
                      files: ["mods/extra.jar"],
                    },
                  ],
                  files: [
                    {
                      name: "pack.jar",
                      project,
                      versionName: "Pack mod 1.0",
                      releaseType: "release",
                    },
                    {
                      name: "extra.jar",
                      project: addon,
                      versionName: "Extra mod 2.0",
                      releaseType: "beta",
                    },
                  ],
                }
              : { pack: null, projects: [], files: [] };
          if (cmd === "content_update_plan")
            return {
              id: "update",
              preview: {
                files: 3,
                bytes: 2048,
                names: ["Pack 2.0", "Required file"],
                target,
              },
            };

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
                  iconUrl: "https://cdn.modrinth.com/data/project/icon.png",
                },
              ],
            };
          }
          if (cmd === "content_versions")
            return mode === "pack"
              ? [
                  {
                    id: "old",
                    name: "Pack 1.0",
                    gameVersions: ["1.21.1"],
                    loaders: ["fabric"],
                    releaseType: "release",
                    published: "2026-10-01T00:00:00Z",
                  },
                  {
                    id: "new",
                    name: "Pack 2.0 beta",
                    gameVersions: ["1.21.1"],
                    loaders: ["fabric"],
                    releaseType: "beta",
                    published: "2026-10-17T00:00:00Z",
                  },
                  {
                    id: "alpha",
                    name: "Pack 2.1 alpha",
                    gameVersions: ["1.21.1"],
                    loaders: ["fabric"],
                    releaseType: "alpha",
                    published: "2026-10-18T00:00:00Z",
                  },
                ]
              : [
                  {
                    id: "version",
                    name: "Compatible release",
                    gameVersions: ["1.21.1"],
                    loaders: ["fabric"],
                    releaseType: "release",
                  },
                ];
          if (cmd === "content_version")
            return {
              version: {
                id: args.version,
                name:
                  args.version === "new"
                    ? "Pack 2.0 beta"
                    : args.version === "alpha"
                      ? "Pack 2.1 alpha"
                      : "Pack 1.0",
                gameVersions: ["1.21.1"],
                loaders: ["fabric"],
                releaseType:
                  args.version === "new"
                    ? "beta"
                    : args.version === "alpha"
                      ? "alpha"
                      : "release",
                published: "2026-10-17T00:00:00Z",
              },
              changelog:
                "# Selected version changes\n\n- Fetched fixes for " +
                args.version,
              html: false,
            };
          if (cmd === "instance_entries")
            return args.section === "worlds"
              ? [{ name: "My World", directory: true, size: 0 }]
              : mode === "pack" && args.section === "mods"
                ? [
                    {
                      name: "pack.jar",
                      directory: false,
                      size: 12,
                      enabled: true,
                    },
                    {
                      name: "extra.jar",
                      directory: false,
                      size: 10,
                      enabled: true,
                    },
                  ]
                : [];
          if (cmd === "toggle_instance_content") return;
          if (cmd === "get_instance_overrides") return {};

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
  }, mode);
  await page.route("https://cdn.modrinth.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5xkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
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

test("project artwork opens description, versions and gallery fetched from provider", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator(".discover-project-cover img")).toHaveAttribute(
    "src",
    /cdn.modrinth.com/,
  );
  await page
    .getByRole("link", { name: "View Test project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Provider description", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".project-description strong")).toHaveText(
    "fetched content",
  );
  expect(
    await page.evaluate(() => (window as any).badDescription),
  ).toBeUndefined();
  await expect(page.locator(".project-description script")).toHaveCount(0);
  await page.getByRole("button", { name: "Gallery", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "In-game view", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await page
    .getByRole("button", { name: "Install Compatible release", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: "Content version" }),
  ).toBeVisible();
});
test("pack instance separates managed and extra content and reviews updates", async ({
  page,
}) => {
  await setup(page, "pack");
  await page.goto("/#/instances/fabric");
  await expect(
    page.getByRole("heading", { name: "Modpack content", exact: true }),
  ).toBeVisible();
  const additional = page.getByRole("table", {
    name: "Additional content",
    exact: true,
  });
  await expect(additional.locator(".content-table-row")).toHaveCount(1);
  await expect(additional.locator("img")).toHaveAttribute(
    "src",
    /cdn.modrinth.com/,
  );
  await expect(
    additional.getByText("Extra mod", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View content", exact: true }).click();
  const pack = page.getByRole("dialog", {
    name: "Modpack content",
    exact: true,
  });
  await expect(pack.locator(".content-table-row")).toHaveCount(1);
  await pack
    .getByRole("textbox", { name: "Search pack content" })
    .fill("nothing");
  await expect(pack.getByText("No matching pack files.")).toBeVisible();
  await pack.getByRole("textbox", { name: "Search pack content" }).fill("pack");
  await page.setViewportSize({ width: 900, height: 650 });
  await page.screenshot({ path: "test-results/pack-content-popup.png" });
  await pack.getByRole("button", { name: "Close pack content" }).click();
  await expect(additional.locator(".content-table-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Switch version", exact: true })
    .click();
  const versions = page.getByRole("dialog", {
    name: "Switch modpack version",
    exact: true,
  });
  await expect(
    versions.getByRole("heading", { name: "Selected version changes" }),
  ).toBeVisible();
  await expect(
    versions.locator(".switch-version-heading .release-badge"),
  ).toHaveText("Beta");
  await versions.getByRole("button", { name: /Alpha Pack 2.1 alpha/ }).click();
  await expect(
    versions.locator(".switch-version-heading .release-badge"),
  ).toHaveText("Alpha");
  await expect(
    versions.getByText("Fetched fixes for alpha", { exact: false }),
  ).toBeVisible();
  await versions
    .getByRole("button", { name: /Release Pack 1.0 Current/ })
    .click();
  await expect(
    versions.locator(".switch-version-heading .release-badge"),
  ).toHaveText("Release");
  await versions.getByRole("button", { name: /Beta Pack 2.0 beta/ }).click();
  await versions
    .getByRole("button", {
      name: "Review update to Pack 2.0 beta",
      exact: true,
    })
    .click();
  await expect(versions.getByText("Ready to install 3 files")).toBeVisible();
  await page.screenshot({ path: "test-results/version-switcher.png" });
  await versions
    .getByRole("button", { name: "Update to Pack 2.0 beta", exact: true })
    .click();
  await expect(versions).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).contentCalls
          .filter((c: any) => c.cmd === "content_update_plan")
          .at(-1).args.requestedVersion,
    ),
  ).toBe("new");
  await page.screenshot({ path: "test-results/additional-content.png" });
});
test("Vanilla instances do not show or open a mods section", async ({
  page,
}) => {
  await setup(page, "vanilla");
  await page.goto("/#/instances/fabric");
  await expect(
    page
      .getByRole("group", { name: "Content type" })
      .getByRole("button", { name: "Mods", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).contentCalls.some(
        (c: any) => c.cmd === "instance_entries" && c.args.section === "mods",
      ),
    ),
  ).toBe(false);
});
test("installation notification has a compact one-line cancel action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await setup(page, "active");
  const button = page.getByRole("button", {
    name: "Cancel install",
    exact: true,
  });
  await expect(button).toBeVisible();
  expect(await button.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe(
    "nowrap",
  );
  expect((await button.boundingBox())!.height).toBeLessThan(36);
  await page.screenshot({ path: "test-results/content-notification.png" });
  await button.click();
  await expect(
    page.getByText("Installation cancelled.", { exact: true }),
  ).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";
const id = "80f8b85f-0a61-42c4-90b5-3b32a01f49ff";
async function setup(page: Page, denied = false, loader = "vanilla") {
  await page.addInitScript(
    ({ id, denied, loader }) => {
      const callbacks: Record<number, (e: unknown) => void> = {};
      const handlers: Record<string, number> = {};
      let sequence = 0;
      const calls: string[] = [];
      const texture = document.createElement("canvas");
      texture.width = 64;
      texture.height = 64;
      const pixels = texture.getContext("2d")!;
      pixels.fillStyle = "#e5a3c6";
      pixels.fillRect(0, 0, 64, 64);
      const skin = texture.toDataURL();
      let savedSkins = [
        {
          id: "saved-one",
          name: "My skin",
          image: skin,
          variant: "classic",
          capeId: null as string | null,
        },
      ];
      texture.height = 32;
      const capePixels = texture.getContext("2d")!;
      capePixels.fillStyle = "#e789b8";
      capePixels.fillRect(1, 1, 10, 16);
      capePixels.fillStyle = "#81a6ed";
      capePixels.fillRect(3, 4, 6, 10);
      const capeTexture = texture.toDataURL();
      const item = {
        id,
        name: "Vanilla test",
        loader,
        loaderVersion: loader === "fabric" ? "0.16.10" : null,
        minecraftVersion: "1.21.1",
        memoryMb: 4096,
        favorite: false,
        createdAt: 1,
      };
      const items = [item];
      const emit = (
        stage: string,
        message: string,
        completed = 0,
        total = 0,
        exitCode: number | null = null,
        prepareOnly = false,
      ) =>
        callbacks[handlers["game-progress"]!]?.({
          event: "game-progress",
          id: 1,
          payload: {
            id,
            stage,
            message,
            completed,
            total,
            exitCode,
            prepareOnly,
          },
        });
      Object.assign(window, {
        isTauri: true,
        gameCalls: calls,
        emitGame: emit,
        emitSkinDrop: (image: string) =>
          callbacks[handlers["skin-file-dropped"]!]?.({
            event: "skin-file-dropped",
            id: 2,
            payload: { image },
          }),
        __TAURI_INTERNALS__: {
          transformCallback: (callback: (e: unknown) => void) => {
            callbacks[++sequence] = callback;
            return sequence;
          },
          invoke: async (cmd: string, args?: Record<string, unknown>) => {
            calls.push(cmd);
            if (cmd === "storage_migration_needed") return false;
            if (cmd === "prepare_storage")
              return {
                required: false,
                instancesPath: "C:\\AzuriaLauncher\\instances",
                migratedInstances: 0,
              };
            if (cmd === "list_instances") return items;
            if (cmd === "loader_metadata")
              return JSON.stringify([
                { loader: { version: "0.20.0", stable: false } },
                { loader: { version: "0.19.5", stable: true } },
              ]);
            if (cmd === "create_instance") {
              const created = {
                ...item,
                ...(args?.input as typeof item),
                id: "created-instance",
              };
              items.push(created);
              if (args?.prepare !== false)
                callbacks[handlers["game-progress"]!]?.({
                  event: "game-progress",
                  id: 1,
                  payload: {
                    id: created.id,
                    stage: "queued",
                    prepareOnly: true,
                    message: "Queued to download Minecraft files",
                    completed: 0,
                    total: 0,
                    exitCode: null,
                  },
                });
              Object.assign(window, {
                createdInput: args?.input,
                createdPrepare: args?.prepare,
                finishQuickGame: () =>
                  callbacks[handlers["game-progress"]!]?.({
                    event: "game-progress",
                    id: 1,
                    payload: {
                      id: created.id,
                      stage: "exited",
                      message: "Game closed",
                      completed: 0,
                      total: 0,
                      exitCode: 0,
                      prepareOnly: false,
                    },
                  }),
              });
              return created;
            }
            if (cmd === "get_settings") return { theme: "dark" };
            if (cmd === "get_privacy")
              return { restoreAccount: true, hideAccount: false };
            if (cmd === "account_status")
              return {
                supported: false,
                account: { username: "Player", minecraftId: "a".repeat(32) },
                verified: !denied,
                hasSavedSession: false,
              };
            if (cmd === "plugin:app|version") return "0.2.100";
            if (cmd === "plugin:updater|check") return null;
            if (cmd === "plugin:event|listen") {
              handlers[String(args?.event)] = args?.handler as number;
              return 1;
            }
            if (cmd === "plugin:event|unlisten") return;
            if (cmd === "game_launches") return [];
            if (cmd === "content_job") return null;
            if (cmd === "content_inventory")
              return { pack: null, projects: [], files: [] };
            if (cmd === "launch_instance") {
              if (denied)
                throw "Minecraft Services denied access. Sign in again after app approval.";
              return;
            }
            if (cmd === "prepare_instance" || cmd === "open_game_monitor")
              return;
            if (cmd === "cancel_launch") {
              emit(
                "cancelled",
                "Preparation cancelled. Verified files retained.",
              );
              return;
            }
            if (cmd === "get_launch_defaults")
              return {
                memoryMb: 4096,
                javaPath: null,
                javaArguments: [],
                environment: {},
                window: { fullscreen: false, width: 1280, height: 720 },
              };
            if (cmd === "get_instance_overrides") return {};
            if (cmd === "skin_library_list") return savedSkins;
            if (cmd === "skin_pick_texture") return skin;
            if (cmd === "skin_library_save") {
              const input = args?.input as (typeof savedSkins)[number];
              const item = { ...input, id: input.id ?? "saved-two" };
              savedSkins = [
                ...savedSkins.filter((s) => s.id !== item.id),
                item,
              ];
              return savedSkins;
            }
            if (cmd === "skin_library_remove") {
              savedSkins = savedSkins.filter((s) => s.id !== args?.id);
              return savedSkins;
            }
            if (cmd === "wardrobe_apply") return;
            if (cmd === "wardrobe_profile")
              return {
                skin,
                variant: "CLASSIC",
                capes: [
                  {
                    id: "cape-one",
                    alias: "Test cape",
                    active: false,
                    image: capeTexture,
                  },
                ],
              };
            if (cmd === "wardrobe_change") {
              calls.push(String(args?.action));
              return true;
            }
            if (cmd === "instance_entries")
              return args?.section === "screenshots"
                ? [
                    {
                      name: "2026-10-17.png",
                      size: 100,
                      enabled: true,
                      directory: false,
                    },
                  ]
                : args?.section === "logs" && !denied
                  ? [
                      {
                        name: "latest.log",
                        size: 100,
                        enabled: true,
                        directory: false,
                      },
                    ]
                  : [];
            if (cmd === "instance_log")
              return `Live line ${calls.filter((c) => c === "instance_log").length}`;
            if (cmd === "screenshot_image")
              return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBz0AAAAASUVORK5CYII=";
            if (
              [
                "screenshot_export",
                "remove_instance_content",
                "open_instance_directory",
              ].includes(cmd)
            )
              return true;
            throw Error(`Unexpected command: ${cmd}`);
          },
        },
      });
    },
    { id, denied, loader },
  );
}
test("Vanilla launch shows progress, survives navigation and tracks running and exit", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/versions?tab=setups");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (
          stage: string,
          message: string,
          completed: number,
          total: number,
        ) => void;
      }
    ).emitGame("assets", "Preparing game assets", 5, 10),
  );
  await expect(
    page.getByRole("progressbar", { name: "Minecraft preparation progress" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open Vanilla test", exact: true })
    .click();
  await expect(
    page.getByText("Preparing Minecraft…", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (stage: string, message: string) => void;
      }
    ).emitGame("running", "Minecraft is running"),
  );
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { gameCalls: string[] }).gameCalls.filter(
          (c) => c === "launch_instance",
        ).length,
    ),
  ).toBe(1);
  await expect(page.locator(".topbar").getByRole("status")).toHaveText(
    "1 instance running",
  );
  await page
    .getByRole("button", { name: "Open logs for Vanilla test", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).gameCalls.includes("open_game_monitor"),
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("vanilla-running.png"),
  });
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (
          stage: string,
          message: string,
          a: number,
          b: number,
          code: number,
        ) => void;
      }
    ).emitGame("exited", "Minecraft closed normally", 0, 0, 0),
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".topbar").getByRole("status")).toHaveText(
    "0 instances running",
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator(".launch-status")).toContainText(
    "Preparation cancelled",
  );
});
test("account failure stays actionable and does not invent a running process", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto(`/#/instances/${id}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page
      .locator(".launch-status")
      .getByRole("alert")
      .or(page.locator(".launch-status[role=alert]")),
  ).toContainText("Minecraft Services denied access");
  await expect(
    page.getByRole("button", { name: "Retry launch", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "View logs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No game logs yet" }),
  ).toBeVisible();
});

test("wardrobe applies an owned cape and supports hiding it", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  await expect(
    page.getByRole("heading", { name: "Skin selector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test cape" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { gameCalls: string[] }).gameCalls.includes(
          "selectCape",
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "No cape" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { gameCalls: string[] }).gameCalls.includes(
          "hideCape",
        ),
      ),
    )
    .toBe(true);
});
test("screenshots preview and export through native commands", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/screenshots");
  await page
    .getByRole("button", { name: "2026-10-17.png Vanilla test" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Screenshot preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export PNG" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { gameCalls: string[] }).gameCalls.includes(
          "screenshot_export",
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Close screenshot" }).click();
});
test("live log updates can be paused and resumed", async ({ page }) => {
  await setup(page);
  await page.goto(`/#/instances/${id}?tab=logs`);
  const output = page.getByLabel("Live game log output");
  await expect(output).toContainText("Live line");
  await page
    .getByRole("button", { name: "Pause live updates", exact: true })
    .click();
  const text = await output.textContent();
  await page.waitForTimeout(1200);
  await expect(output).toHaveText(text!);
  await page
    .getByRole("button", { name: "Resume live updates", exact: true })
    .click();
  await expect(output).not.toHaveText(text!);
  await page
    .getByRole("button", { name: "Pause live updates", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search logs" })
    .fill("no matching output");
  await expect(
    page.getByRole("heading", { name: "No matching lines" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search logs" }).fill("");
  await expect(output).toContainText("Live line");
  await page.getByRole("button", { name: "Clear displayed logs" }).click();
  await expect(
    page.getByRole("heading", { name: "Display cleared" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume live updates", exact: true })
    .click();
  await expect(output).toContainText("Live line");
  await page.screenshot({ path: test.info().outputPath("console-logs.png") });
});

test("the account menu shows the player skin head", async ({ page }) => {
  await setup(page);
  await page.goto("/#/versions?tab=setups");
  await expect(page.locator(".topbar-account canvas")).toBeVisible();
  await page
    .getByRole("link", { name: "Skins and capes", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Current Minecraft skin preview" }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("wardrobe.png") });
});
test("Stop terminates a running game after acknowledgement", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (stage: string, message: string) => void;
      }
    ).emitGame("running", "Minecraft running"),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { gameCalls: string[] }).gameCalls.includes(
          "cancel_launch",
        ),
      ),
    )
    .toBe(true);
});

test("owned capes show cropped wearable faces instead of the atlas", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  const cape = page.getByRole("img", { name: "Test cape cape preview" });
  await expect(cape).toBeVisible();
  await expect(cape.locator(".cape-front")).toHaveCSS(
    "background-position",
    "-5px -5px",
  );
  await expect(cape.locator(".cape-model")).not.toHaveCSS("transform", "none");
  await expect(
    page.getByRole("button", { name: /Test cape/ }).locator("img"),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("cape-preview.png") });
});

test("saved skin cards expose edit actions and changes save locally before account apply", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  const card = page.locator(".saved-skin-card").first();
  await card.hover();
  await page.getByRole("button", { name: "Edit My skin", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Editing skin",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Skin name", { exact: true }).fill("Blue penguin");
  await editor.getByLabel("Slim", { exact: true }).check();
  await editor.getByRole("button", { name: /Test cape/ }).click();
  await editor.getByRole("button", { name: "Save skin", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview Blue penguin", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "wardrobe_apply",
      ),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Preview Blue penguin", exact: true })
    .click();
  await page.getByRole("button", { name: "Use skin", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { gameCalls: string[] }).gameCalls.includes(
          "wardrobe_apply",
        ),
      ),
    )
    .toBe(true);
});
test("adding, cancelling and removing a saved skin keep account changes explicit", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  await page.getByRole("button", { name: /Add skin/ }).click();
  let editor = page.getByRole("dialog", { name: "Add skin", exact: true });
  await editor.getByRole("button", { name: "Choose texture" }).click();
  await editor.getByLabel("Skin name", { exact: true }).fill("New outfit");
  await editor.getByRole("button", { name: "Save skin", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview New outfit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preview New outfit", exact: true })
    .hover();
  await page
    .getByRole("button", { name: "Edit New outfit", exact: true })
    .click();
  editor = page.getByRole("dialog", { name: "Editing skin", exact: true });
  await editor.getByLabel("Skin name", { exact: true }).fill("Discard this");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview New outfit", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Preview New outfit", exact: true })
    .hover();
  await page
    .getByRole("button", { name: "Remove New outfit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview New outfit", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("skin-selector.png") });
});
test("the skin preview rotates with pointer and keyboard controls", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  const model = page.locator(".skin-current .skin-model-person");
  await expect(model).toBeVisible();
  const before = await model.getAttribute("style");
  await page
    .getByRole("button", { name: "Rotate skin right", exact: true })
    .click();
  await expect(model).not.toHaveAttribute("style", before!);
  await page
    .getByRole("button", { name: "Reset skin rotation", exact: true })
    .click();
  await expect(model).toHaveAttribute("style", before!);
  const bounds = await page
    .locator(".skin-current .skin-model-stage")
    .boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 60,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.up();
  await expect(model).not.toHaveAttribute("style", before!);
});

test("a native PNG drop opens the editor without changing the account", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/wardrobe");
  await expect(
    page.getByRole("button", { name: "Preview My skin" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    (
      window as unknown as { emitSkinDrop: (image: string) => void }
    ).emitSkinDrop(c.toDataURL());
  });
  await expect(
    page.getByRole("dialog", { name: "Add skin", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "wardrobe_apply",
      ),
    ),
  ).toBe(false);
});

// Native preparation is tested separately; this verifies Fabric uses the existing UI lifecycle.
test("Fabric uses Play/Stop and cancellation during loader preparation", async ({
  page,
}) => {
  await setup(page, false, "fabric");
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (stage: string, message: string) => void;
      }
    ).emitGame("loader", "Preparing Fabric"),
  );
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
});

test("download-only tasks can stop, resume and become ready without starting Minecraft", async ({
  page,
}) => {
  await setup(page, false, "fabric");
  await page.goto("/#/versions?tab=setups");
  const progress = (stage: string, message: string) =>
    page.evaluate(
      ({ stage, message }) =>
        (
          window as unknown as { emitGame: (...args: unknown[]) => void }
        ).emitGame(stage, message, 1, 3, null, true),
      { stage, message },
    );
  await progress("libraries", "Downloading Minecraft files");
  await expect(
    page.getByRole("progressbar", { name: "Instance download progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await progress("cancelled", "Download cancelled");
  await page
    .getByRole("button", { name: "Resume download", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "prepare_instance",
      ),
    ),
  ).toBe(true);
  await progress(
    "prepared",
    "Minecraft files are ready. Press Play to start the game.",
  );
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "launch_instance",
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "launch_instance",
      ),
    ),
  ).toBe(true);
});

test("creating Fabric pins Stable and starts download-only preparation", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://piston-meta.mojang.com/**", (route) =>
    route.fulfill({ json: { versions: [{ id: "26.1", type: "release" }] } }),
  );
  await page.goto("/#/versions?tab=setups");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  await page.getByLabel("Instance name", { exact: true }).fill("New Fabric");
  await page.getByRole("button", { name: "Fabric", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { createdInput: { loaderVersion: string } })
          .createdInput.loaderVersion,
    ),
  ).toBe("0.19.5");
  expect(
    await page.evaluate(() =>
      (window as unknown as { gameCalls: string[] }).gameCalls.includes(
        "launch_instance",
      ),
    ),
  ).toBe(false);
});

test("topbar Stop reaches the native cancellation command", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/versions?tab=setups");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.evaluate(() =>
    (window as any).emitGame("running", "Minecraft running"),
  );
  await page
    .getByRole("button", { name: "Running instances", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Stop Vanilla test", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).gameCalls.includes("cancel_launch")),
    )
    .toBe(true);
});

test("Home creates one automatic setup without background preparation and reuses it", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({ json: { versions: [{ id: "1.21.1", type: "release" }] } }),
  );
  await page.goto("/");
  const launch = page.locator(".launch-main");
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect(
    page.getByRole("button", { name: /Cancel launch/ }),
  ).toBeVisible();
  const result = await page.evaluate(() => ({
    calls: (window as any).gameCalls,
    input: (window as any).createdInput,
    prepare: (window as any).createdPrepare,
  }));
  expect(result.prepare).toBe(false);
  expect(result.input.loader).toBe("vanilla");
  expect(
    result.calls.filter((c: string) => c === "create_instance"),
  ).toHaveLength(1);
  expect(
    result.calls.filter((c: string) => c === "launch_instance"),
  ).toHaveLength(1);
  expect(
    result.calls.filter((c: string) => c === "prepare_instance"),
  ).toHaveLength(0);
  await page.evaluate(() => (window as any).finishQuickGame());
  await expect(launch).toContainText("Launch game");
  await launch.click();
  const calls = await page.evaluate(
    () => (window as any).gameCalls as string[],
  );
  expect(calls.filter((c) => c === "create_instance")).toHaveLength(1);
  expect(calls.filter((c) => c === "launch_instance")).toHaveLength(2);
});

test("task panel retains completed work and notifications without inventing downloads", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/#/versions?tab=setups");
  await page
    .getByRole("button", { name: "Downloads and tasks", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No tasks yet", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.evaluate(() =>
    (window as any).emitGame("assets", "Downloading Minecraft", 5, 10),
  );
  await page
    .getByRole("button", { name: "Downloads and tasks", exact: true })
    .click();
  const tasks = page.getByRole("region", { name: "Tasks", exact: true });
  await expect(
    tasks.getByText("Downloading Minecraft", { exact: true }),
  ).toBeVisible();
  await expect(tasks.getByRole("progressbar")).toHaveAttribute("value", "50");
  await page.evaluate(() =>
    (window as any).emitGame("prepared", "Files ready", 10, 10, null, true),
  );
  await expect(
    tasks.getByRole("heading", { name: "Complete", exact: true }),
  ).toBeVisible();
  await expect(tasks.getByText("Files ready", { exact: true })).toBeVisible();
  await tasks.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(
    tasks.getByRole("heading", { name: "No tasks yet", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const notices = page.getByRole("region", {
    name: "Notifications",
    exact: true,
  });
  await expect(notices).toContainText("Vanilla test: Files ready");
  await notices.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(
    notices.getByRole("heading", { name: "You’re all caught up", exact: true }),
  ).toBeVisible();
});

test("game monitor separates live logs and screenshots with two ad slots", async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/#/monitor/${id}`);
  await expect(
    page.getByRole("heading", { name: "Game logs", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Live game log output")).toContainText(
    "Live line",
  );
  await expect(page.locator(".square-ad")).toHaveCount(2);
  for (const width of [900, 1280]) {
    await page.setViewportSize({ width, height: 650 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath("monitor-logs.png") });
  await page
    .getByRole("button", { name: "Game screenshots", exact: true })
    .click();
  await page.getByRole("button", { name: /2026-10-17.png/ }).click();
  const preview = page.getByRole("dialog", { name: "Screenshot preview" });
  await expect(preview).toBeVisible();
  await preview
    .getByRole("button", { name: "Export PNG", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).gameCalls.includes("screenshot_export"),
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("monitor-screenshot-preview.png"),
  });
  await preview
    .getByRole("button", { name: "Close screenshot", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search screenshots", exact: true })
    .fill("missing");
  await expect(
    page.getByText("No matching screenshots.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Game logs", exact: true }).click();
  await expect(page.getByLabel("Live game log output")).toContainText(
    "Live line",
  );
});

test("launching an installed modpack returns Home with the exact profile and its version", async ({
  page,
}) => {
  await setup(page, false, "fabric");
  await page.goto("/#/");
  await page.evaluate(
    async ({ id }) => {
      const apiPath = "/src/content-api.ts",
        storePath = "/src/stores/launcher.ts";
      const { contentApi } = await import(apiPath);
      const { useLauncher } = await import(storePath);
      useLauncher().instances.find((i: any) => i.id === id).name =
        "Forest adventure";
      contentApi.installedPacks = async () => ({
        packs: [
          {
            instanceId: id,
            pack: { provider: "modrinth", projectId: "forest", version: "v1" },
          },
        ],
        unreadable: [],
      });
      contentApi.project = async () => {
        throw Error("offline");
      };
    },
    { id },
  );
  await page.getByRole("link", { name: "Versions", exact: true }).click();
  await page.getByLabel("Version library").selectOption("modpacks");
  await expect(page.locator(".version-context h2")).toHaveText(
    "Forest adventure",
  );
  await page.getByRole("button", { name: "Launch game", exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator(".launch-main")).toContainText("Forest adventure");
  await expect(page.locator(".launch-main")).toContainText("Minecraft 1.21.1");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).gameCalls.filter(
            (c: string) => c === "launch_instance",
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      (window as any).gameCalls.includes("open_game_monitor"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as any).gameCalls.includes("create_instance"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("azuria-quick-play-v1")!).profileId,
    ),
  ).toBe(id);
  await page.screenshot({
    path: test.info().outputPath("modpack-home-launch.png"),
  });
});

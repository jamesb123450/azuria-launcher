import { test, expect, type Page } from "@playwright/test";
const id = "80f8b85f-0a61-42c4-90b5-3b32a01f49ff";
async function setup(page: Page, denied = false) {
  await page.addInitScript(
    ({ id, denied }) => {
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
        loader: "vanilla",
        minecraftVersion: "1.21.1",
        memoryMb: 4096,
        favorite: false,
        createdAt: 1,
      };
      const emit = (
        stage: string,
        message: string,
        completed = 0,
        total = 0,
        exitCode: number | null = null,
      ) =>
        callbacks[handlers["game-progress"]!]?.({
          event: "game-progress",
          id: 1,
          payload: { id, stage, message, completed, total, exitCode },
        });
      Object.assign(window, {
        isTauri: true,
        gameCalls: calls,
        emitGame: emit,
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
            if (cmd === "list_instances") return [item];
            if (cmd === "get_settings") return { theme: "dark" };
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
            if (cmd === "launch_instance") {
              if (denied)
                throw "Minecraft Services denied access. Sign in again after app approval.";
              return;
            }
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
    { id, denied },
  );
}
test("Vanilla launch shows progress, survives navigation and tracks running and exit", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
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
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Preparation cancelled");
});
test("account failure stays actionable and does not invent a running process", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto(`/#/instances/${id}`);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Minecraft Services denied access",
  );
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
    page.getByRole("heading", { name: "Skins & capes" }),
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
  await page.getByLabel("Pause", { exact: true }).check();
  const text = await output.textContent();
  await page.waitForTimeout(1200);
  await expect(output).toHaveText(text!);
  await page.getByLabel("Pause", { exact: true }).uncheck();
  await expect(output).not.toHaveText(text!);
});

test("the account sidebar shows the player skin head", async ({ page }) => {
  await setup(page);
  await page.goto("/");
  await expect(page.locator(".account-portrait canvas")).toBeVisible();
  await page.locator(".account-identity").click();
  await expect(
    page.getByRole("img", { name: "Current Minecraft skin preview" }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("wardrobe.png") });
});
test("Stop terminates a running game after acknowledgement", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
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

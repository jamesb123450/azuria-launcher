import { test, expect, type Page } from "@playwright/test";
const id = "80f8b85f-0a61-42c4-90b5-3b32a01f49ff";
async function setup(page: Page, denied = false) {
  await page.addInitScript(
    ({ id, denied }) => {
      const callbacks: Record<number, (e: unknown) => void> = {};
      const handlers: Record<string, number> = {};
      let sequence = 0;
      const calls: string[] = [];
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
            if (cmd === "instance_entries") return [];
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
    page.getByRole("button", { name: "Preparing…", exact: true }),
  ).toBeDisabled();
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
  ).toHaveAttribute("value", "50");
  await page
    .getByRole("button", { name: "Open Vanilla test", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Preparing game assets");
  await page.evaluate(() =>
    (
      window as unknown as {
        emitGame: (stage: string, message: string) => void;
      }
    ).emitGame("running", "Minecraft is running"),
  );
  await expect(
    page.getByRole("button", { name: "Running", exact: true }),
  ).toBeDisabled();
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
  await page
    .getByRole("button", { name: "Cancel preparation", exact: true })
    .click();
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

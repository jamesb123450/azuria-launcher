import { expect, test, type Page } from "@playwright/test";
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});
const id = "22222222-2222-4222-8222-222222222222";
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://piston-meta.mojang.com/**", (r) =>
    r.fulfill({
      json: {
        versions: [
          { id: "1.21.1", type: "release" },
          { id: "1.20.1", type: "release" },
        ],
      },
    }),
  );
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "azuria-preview-v1",
        JSON.stringify({
          instances: [
            {
              id,
              name: "Forest adventure",
              minecraftVersion: "1.21.1",
              loader: "fabric",
              loaderVersion: "0.16.10",
              memoryMb: 4096,
              favorite: false,
              createdAt: 1,
            },
          ],
          settings: { theme: "dark" },
        }),
      ),
    { id },
  );
});
test("installed modpacks use portrait cards and update the sidebar without changing the profile", async ({
  page,
}) => {
  await page.goto("/#/versions");
  await page.evaluate(
    async ({ id }) => {
      const path = "/src/content-api.ts";
      const { contentApi } = await import(path);
      contentApi.project = async () => ({
        project: {
          id: "pack1234",
          name: "Forest adventure",
          description: "A modpack",
          author: "Pack author",
          url: "https://modrinth.com/modpack/forest",
          downloads: 100,
          categories: [],
          iconUrl: "https://cdn.modrinth.com/data/pack1234/icon.png",
        },
        body: "",
        bodyHtml: false,
        followers: 0,
        gallery: [],
      });
      contentApi.installedPacks = async () => ({
        packs: [
          {
            instanceId: id,
            pack: {
              provider: "modrinth",
              projectId: "pack1234",
              version: "v1",
            },
          },
        ],
        unreadable: [],
      });
    },
    { id },
  );
  await page.route("https://cdn.modrinth.com/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5xkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Profiles", exact: true }).click();
  await expect(
    page.locator(".profile-icon-badge .content-icon img"),
  ).toHaveAttribute("src", "https://cdn.modrinth.com/data/pack1234/icon.png");
  await expect(
    page.getByRole("heading", { name: "Forest adventure", exact: true }),
  ).toBeVisible();
  for (const width of [900, 1024, 1280, 1588]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("installed-modpacks.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Open Forest adventure" }).click();
  await expect(page).toHaveURL(new RegExp(`/instances/${id}`));
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("azuria-preview-v1")!).instances.length,
    ),
  ).toBe(1);
});
test("legacy modpack library URLs now show Profiles without separate catalogues", async ({
  page,
}) => {
  await page.goto("/#/versions?tab=modpacks");
  await expect(
    page.getByRole("heading", { name: "Profiles", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Version library")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New profile", exact: true }),
  ).toBeVisible();
});
test("the account dropdown supports keyboard navigation, dismissal and working destinations", async ({
  page,
}) => {
  await page.goto("/#/versions");
  const trigger = page.getByRole("button", {
    name: "Sign in to Minecraft",
    exact: true,
  });
  await trigger.click();
  const menu = page.getByRole("menu", {
    name: "Minecraft account actions",
    exact: true,
  });
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Sign in with Microsoft" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Change skin / cape" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Screenshots", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await expect(
    page.getByRole("dialog", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
});
test("saved Minecraft accounts can reauthenticate and switch without a fabricated account list", async ({
  page,
}) => {
  await page.goto("/#/versions");
  await page.evaluate(async () => {
    const path = "/src/stores/account.ts",
      auth = "/src/auth.ts";
    const { useAccount } = await import(path);
    const { accountApi } = await import(auth);
    const account = useAccount();
    account.view = {
      supported: true,
      verified: false,
      hasSavedSession: true,
      account: { username: "Player", minecraftId: "player" },
    };
    accountApi.progress = async () => () => {};
    accountApi.restore = async () => ({ ...account.view, verified: true });
  });
  const trigger = page.getByRole("button", {
    name: "Manage Minecraft account",
    exact: true,
  });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Reauthenticate now" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Switch account", exact: true })
    .click();
  await expect(
    page.getByRole("menu", { name: "Switch Minecraft account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This replaces the account saved on this device."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("menu", { name: "Switch Minecraft account", exact: true })
      .getByRole("menuitem", { name: "Sign in with Microsoft" }),
  ).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("minecraft-account-menu.png"),
    animations: "disabled",
  });
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("menuitem", { name: "Switch account", exact: true }),
  ).toBeFocused();
});

import { expect, test, type Page } from "@playwright/test";
async function chooseVersion(
  page: Page,
  value: string,
  label = "Game version",
) {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await expect(trigger).toBeEnabled();
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await page
    .getByRole("option", {
      name: value === "__manual" ? "Enter version manually…" : value,
      exact: true,
    })
    .click();
}
test.use({ colorScheme: "dark" });
test.beforeEach(async ({ page }) => {
  await page.route("https://meta.fabricmc.net/**", (route) =>
    route.fulfill({
      json: [
        { loader: { version: "0.16.10", stable: true } },
        { loader: { version: "0.16.9", stable: true } },
        { loader: { version: "0.17.0-beta.1", stable: false } },
      ],
    }),
  );
  await page.route("https://meta.quiltmc.org/**", (route) =>
    route.fulfill({ json: [{ loader: { version: "0.26.0", stable: true } }] }),
  );
  await page.route("https://maven.minecraftforge.net/**", (route) =>
    route.fulfill({
      contentType: "application/xml",
      body: "<metadata><versioning><versions><version>1.20.1-47.3.0</version><version>1.20.1-47.2.0</version><version>1.21.1-52.0.0</version></versions></versioning></metadata>",
    }),
  );
  await page.route("https://maven.neoforged.net/**", (route) =>
    route.fulfill({
      contentType: "application/xml",
      body: "<metadata><versioning><versions><version>21.1.100</version></versions></versioning></metadata>",
    }),
  );

  await page.route("https://piston-meta.mojang.com/**", (route) =>
    route.fulfill({
      json: {
        versions: [
          { id: "1.21.1", type: "release" },
          { id: "1.20.1", type: "release" },
          { id: "24w14a", type: "snapshot" },
        ],
      },
    }),
  );
});

test("persistent library lifecycle and honest launch state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  await page.getByLabel("Instance name", { exact: true }).fill("Aurora");
  await chooseVersion(page, "1.21.1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(
    page
      .locator(".instance-card")
      .getByRole("heading", { name: "Aurora", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".selected-instance")
      .getByRole("heading", { name: "Aurora", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".jump-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Launch unavailable", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Game downloads and launching are still in development.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Favourite Aurora", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unfavourite Aurora", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Edit Aurora", exact: true }).click();
  await page.getByLabel("Instance name", { exact: true }).fill("Aurora edited");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .getByRole("button", {
      name: "More actions for Aurora edited",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Copy settings for Aurora edited" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search instances" }).fill("missing");
  await expect(page.getByText("No matching instances.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("button", {
      name: "More actions for Aurora edited",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Delete Aurora edited", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove instance", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".instance-card")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("themes persist and modal cancellation restores focus", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Light", exact: false }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "test-results/settings-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark", exact: false }).click();
  await page.getByRole("link", { name: /Library/ }).click();
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  await expect(page.getByLabel("Instance name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create instance", exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "test-results/library-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 900, height: 650 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("instance selection and grid/list views work at minimum desktop size", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Survival",
    "Creative",
    "Exploration",
    "Building",
    "Skyblock",
  ]) {
    await page
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await page.getByRole("button", { name: /Custom setup/ }).click();
    await page.getByLabel("Instance name", { exact: true }).fill(name);
    await chooseVersion(page, "1.21.1");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Open Survival", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Survival", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Library", exact: true }).last().click();
  await expect(
    page
      .locator(".selected-instance")
      .getByRole("heading", { name: "Survival", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 900, height: 650 });
  await page
    .getByRole("button", { name: "Launch unavailable", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Launch unavailable", exact: true }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.locator(".instance-card").first().scrollIntoViewIfNeeded();
  await expect(page.locator(".instance-card").first()).toBeInViewport();
  const avatar = await page.locator(".rail-avatar").boundingBox();
  expect(avatar!.y + avatar!.height).toBeLessThanOrEqual(650);
  await expect(
    page.getByRole("link", { name: "Settings", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("browser preview does not offer desktop updates", async ({ page }) => {
  await page.goto("/#/settings");
  await expect(
    page.getByRole("heading", { name: "Always moving forward" }),
  ).toBeVisible();
  await expect(
    page.getByText("Updates are available in the installed desktop app."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update & restart" }),
  ).toHaveCount(0);
});

test("library grouping and collapsed sections remain usable", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["Alpha", "Beta"]) {
    await page
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await page.getByRole("button", { name: /Custom setup/ }).click();
    await page.getByLabel("Instance name", { exact: true }).fill(name);
    await chooseVersion(page, "1.21.1");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Favourite Alpha", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Filters & sorting", exact: true })
    .click();
  await chooseVersion(page, "Group by favourites", "Group instances");
  const favourites = page.locator(".instance-group").filter({
    has: page.getByRole("heading", { name: "Favourites", exact: true }),
  });
  await expect(favourites.locator(".instance-card")).toHaveCount(1);
  await favourites.getByRole("button", { expanded: true }).first().click();
  await expect(favourites.locator(".instance-card")).toHaveCount(0);
  await favourites.getByRole("button", { expanded: false }).first().click();
  await expect(favourites.locator(".instance-card")).toHaveCount(1);
  await expect(page.locator(".jump-row")).toHaveCount(0);
  await chooseVersion(page, "No grouping", "Group instances");
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: false }).click();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  const icon = await page.locator(".tile-art svg").first().boundingBox();
  expect(icon!.width).toBeGreaterThan(30);
  expect(icon!.height).toBeGreaterThan(30);
});

test("failed saves retain input and unrelated errors do not block creation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  await page.getByLabel("Instance name", { exact: true }).fill("Retry world");
  await chooseVersion(page, "1.21.1");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      Storage.prototype.setItem = original;
      throw new Error("Storage temporarily unavailable");
    };
  });
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Storage temporarily unavailable",
  );
  await expect(page.getByLabel("Instance name", { exact: true })).toHaveValue(
    "Retry world",
  );
  await dialog
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      Storage.prototype.setItem = original;
      throw new Error("Favourite temporarily unavailable");
    };
  });
  await page
    .getByRole("button", { name: "Favourite Retry world", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Favourite temporarily unavailable",
  );
  const create = page.getByRole("button", {
    name: "Create instance",
    exact: true,
  });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
});

test("custom setup preserves selections, icons and all loader types", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  for (const name of [
    /Start from a mod/,
    /Upload a modpack/,
    /Import instance/,
  ])
    await expect(dialog.getByRole("button", { name })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: /Custom setup/ }),
  ).toBeFocused();
  await page.screenshot({ path: "test-results/create-choice-dark.png" });
  await dialog.getByRole("button", { name: /Custom setup/ }).click();
  await page.getByLabel("Instance name", { exact: true }).fill("Moonlight");
  await dialog.getByRole("button", { name: "Randomize", exact: true }).click();
  await dialog.getByRole("button", { name: "Customize", exact: true }).click();
  await dialog.getByRole("button", { name: "Cube icon", exact: true }).click();
  const icon = await dialog
    .locator(".create-icon-preview img")
    .getAttribute("src");
  await dialog.getByRole("button", { name: "Moon icon", exact: true }).click();
  await expect(dialog.locator(".create-icon-preview img")).not.toHaveAttribute(
    "src",
    icon!,
  );
  await dialog.getByRole("button", { name: "Forge", exact: true }).click();
  await dialog.getByRole("button", { name: "Latest", exact: true }).click();
  await dialog.getByRole("button", { name: "Other", exact: true }).click();
  await chooseVersion(page, "1.20.1");
  await dialog.getByRole("button", { name: "Other", exact: true }).click();
  await chooseVersion(page, "47.3.0", "Loader version number");
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await dialog.getByRole("button", { name: /Custom setup/ }).click();
  await expect(page.getByLabel("Instance name", { exact: true })).toHaveValue(
    "Moonlight",
  );
  await expect(
    dialog.getByRole("button", { name: "Forge", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const savedIcon = await dialog
    .locator(".create-icon-preview img")
    .getAttribute("src");
  await page.screenshot({ path: "test-results/create-setup-dark.png" });
  await dialog
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".instance-card .instance-version")).toHaveText(
    "Forge 1.20.1",
  );
  await expect(
    page.locator(".instance-card .instance-symbol img"),
  ).toHaveAttribute("src", savedIcon!);
  await page
    .getByRole("button", { name: "Edit Moonlight", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Loader version number", exact: true }),
  ).toHaveText("47.3.0");
  await page.keyboard.press("Escape");

  for (const loader of ["NeoForge", "Quilt"]) {
    await page
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await page.getByRole("button", { name: /Custom setup/ }).click();
    await dialog.getByRole("button", { name: loader, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await expect(
      page
        .locator(".instance-card .instance-version")
        .filter({ hasText: loader }),
    ).toHaveCount(1);
  }
});

test("icon uploads, manual versions and minimum-height light layout work", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Light", exact: false }).click();
  await page.getByRole("link", { name: "Library", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 650 });
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.screenshot({ path: "test-results/create-choice-light.png" });
  await page.getByRole("button", { name: /Custom setup/ }).click();
  const dialog = page.getByRole("dialog");
  await page.getByLabel("Upload instance icon").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(dialog.getByRole("alert")).toContainText("PNG, JPEG or WebP");
  await page.getByLabel("Upload instance icon").setInputFiles({
    name: "icon.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#b9a4ed";
        ctx.fillRect(0, 0, 16, 16);
        return canvas.toDataURL("image/png").split(",")[1]!;
      }),
      "base64",
    ),
  });
  await expect(dialog.locator(".create-icon-preview img")).toBeVisible();
  await dialog.getByRole("button", { name: "Fabric", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Game version", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show all versions", exact: true })
    .click();
  await expect(page.getByRole("option", { name: /24w14a/ })).toBeVisible();
  await chooseVersion(page, "__manual");
  await page.getByLabel("Minecraft version", { exact: true }).fill("24w14a");
  await page.getByLabel("Instance name", { exact: true }).fill("Uploaded");
  await expect(dialog.getByText(/Memory allocation/)).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Create instance", exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("heading", { name: "Create instance", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: "test-results/create-setup-light.png" });
  const box = await dialog.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(610);
  await dialog
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.locator(".instance-card .instance-version")).toHaveText(
    "Fabric 24w14a",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Edit Uploaded", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/Memory allocation/),
  ).toHaveCount(0);
});

test("catalogue failures leave manual creation available", async ({ page }) => {
  await page.unroute("https://piston-meta.mojang.com/**");
  await page.route("https://piston-meta.mojang.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  await expect(page.getByText(/Couldn’t load the version list/)).toBeVisible();
  await chooseVersion(page, "__manual");
  await page.getByLabel("Minecraft version", { exact: true }).fill("1.19.2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.locator(".instance-card .instance-version")).toHaveText(
    "Vanilla 1.19.2",
  );
});

test("version menus support keyboard navigation, pre-releases and game-specific loaders", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByRole("button", { name: /Custom setup/ }).click();
  const game = page.getByRole("combobox", {
    name: "Game version",
    exact: true,
  });
  await game.focus();
  await page.keyboard.press("ArrowDown");
  await expect(game).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: "test-results/game-version-menu-dark.png" });
  await page.keyboard.press("Escape");
  await expect(game).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(game).toHaveText("1.20.1");

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Forge", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Other", exact: true })
    .click();
  const loader = page.getByRole("combobox", {
    name: "Loader version number",
    exact: true,
  });
  await expect(loader).toBeEnabled();
  await loader.click();
  await expect(
    page.getByRole("option", { name: "47.2.0", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/loader-version-menu-dark.png" });
  await page.keyboard.press("Escape");
  await chooseVersion(page, "1.21.1");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Stable", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Other", exact: true })
    .click();
  await expect(loader).toBeEnabled();
  await loader.click();
  await expect(
    page.getByRole("option", { name: "52.0.0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "47.3.0", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fabric", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Other", exact: true })
    .click();
  await expect(loader).toBeEnabled();
  await loader.click();
  await expect(page.getByRole("option", { name: /0.17.0-beta.1/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Show all versions", exact: true })
    .click();
  await page.getByRole("option", { name: /0.17.0-beta.1/ }).click();
  await expect(loader).toContainText("0.17.0-beta.1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem("azuria-preview-v1")!).instances[0],
  );
  expect(stored.loaderVersion).toBe("0.17.0-beta.1");
  expect(stored.memoryMb).toBe(4096);
});

test("loader catalogue errors are retryable and editing preserves existing memory", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "azuria-preview-v1",
      JSON.stringify({
        settings: { theme: "light" },
        instances: [
          {
            id: "saved",
            name: "Existing",
            minecraftVersion: "1.21.1",
            loader: "fabric",
            memoryMb: 32768,
            favorite: false,
            createdAt: Date.now(),
          },
        ],
      }),
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Edit Existing", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Memory allocation/)).toHaveCount(0);
  await page.unroute("https://meta.fabricmc.net/**");
  await page.route("https://meta.fabricmc.net/**", (route) => route.abort());
  await dialog.getByRole("button", { name: "Other", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Couldn’t load loader versions",
  );
  await expect(
    dialog.getByRole("textbox", { name: "Loader version number", exact: true }),
  ).toHaveCount(0);
  await page.unroute("https://meta.fabricmc.net/**");
  await page.route("https://meta.fabricmc.net/**", (route) =>
    route.fulfill({ json: [{ loader: { version: "0.16.10", stable: true } }] }),
  );
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  const picker = page.getByRole("combobox", {
    name: "Loader version number",
    exact: true,
  });
  await expect(picker).toBeEnabled();
  await picker.click();
  await page.screenshot({ path: "test-results/loader-version-menu-light.png" });
  await page.getByRole("option", { name: "0.16.10", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem("azuria-preview-v1")!).instances[0],
  );
  expect(stored.memoryMb).toBe(32768);
  expect(stored.loaderVersion).toBe("0.16.10");
});

test("account navigation explains Windows-only sign-in in browser preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Minecraft account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Minecraft account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Microsoft sign-in is available in the Windows desktop app.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Microsoft" }),
  ).toHaveCount(0);
});

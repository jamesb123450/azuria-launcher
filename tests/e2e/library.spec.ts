import { expect, test } from "@playwright/test";
test("persistent library lifecycle and honest launch state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await page.getByLabel("Instance name", { exact: true }).fill("Aurora");
  await page.getByLabel("Minecraft version", { exact: true }).fill("1.21.1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aurora", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Play", exact: false }).click();
  await expect(
    page.getByText("Launching is not implemented in this build."),
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
    .getByRole("button", { name: "Copy settings for Aurora edited" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create instance", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search instances" }).fill("missing");
  await expect(page.getByText("No matching adventures.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
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
    await page.getByLabel("Instance name", { exact: true }).fill(name);
    await page.getByLabel("Minecraft version", { exact: true }).fill("1.21.1");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Select Survival", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select recent Survival", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 900, height: 650 });
  await page
    .getByRole("button", { name: "Play Survival", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Play Survival", exact: true }),
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
    page.getByRole("heading", { name: "Launcher updates" }),
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
    await page.getByLabel("Instance name", { exact: true }).fill(name);
    await page.getByLabel("Minecraft version", { exact: true }).fill("1.21.1");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Favourite Alpha", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Group instances" })
    .selectOption("favorites");
  const favourites = page.locator(".instance-group").filter({
    has: page.getByRole("heading", { name: "Favourites", exact: true }),
  });
  await expect(favourites.locator(".instance-card")).toHaveCount(1);
  await favourites.getByRole("button", { expanded: true }).first().click();
  await expect(favourites.locator(".instance-card")).toHaveCount(0);
  await favourites.getByRole("button", { expanded: false }).first().click();
  await expect(favourites.locator(".instance-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Jump in", exact: true }).click();
  await expect(page.locator(".jump-row")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Group instances" })
    .selectOption("none");
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
  await page.getByLabel("Instance name", { exact: true }).fill("Retry world");
  await page.getByLabel("Minecraft version", { exact: true }).fill("1.21.1");
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

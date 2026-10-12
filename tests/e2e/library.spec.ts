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
  for (const name of ["Survival", "Creative"]) {
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
  const selection = page.getByRole("combobox", {
    name: "Selected instance",
    exact: true,
  });
  await expect(selection).not.toHaveValue("");
  const survivalId = await selection
    .locator("option")
    .filter({ hasText: "Survival" })
    .getAttribute("value");
  await selection.selectOption(survivalId!);
  await expect(
    page
      .locator(".world-banner")
      .getByRole("heading", { name: "Survival", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "List view", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(page.getByRole("button", { name: /Play/ })).toBeInViewport();
  await expect(page.locator(".instance-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

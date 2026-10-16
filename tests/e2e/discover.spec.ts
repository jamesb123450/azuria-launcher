import { expect, test } from "@playwright/test";
test("discovery preview supports categories, search, filters, sorting and pagination", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional projects, creators and statistics.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".discover-project")).toHaveCount(6);
  await expect(
    page.getByRole("button", {
      name: "Install Wildlight — coming soon",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next catalogue page" }).click();
  await expect(page.locator(".discover-project")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Catalogue page 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("combobox", { name: "Sort projects" }).click();
  await page
    .getByRole("option", { name: "Recently updated", exact: true })
    .click();
  await expect(page.locator(".discover-project h2").first()).toHaveText(
    "Copper & Steam",
  );
  await page
    .getByRole("textbox", { name: "Search modpacks", exact: true })
    .fill("wildlight");
  await expect(page.locator(".discover-project")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear discovery search" }).click();
  await page.getByRole("button", { name: "CurseForge", exact: true }).click();
  await expect(page.locator(".discover-project")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Mods 6", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search mods", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Discover loader" }).click();
  await page.getByRole("option", { name: "NeoForge", exact: true }).click();
  await expect(page.locator(".discover-project h2")).toHaveText([
    "Moss & Meadow",
  ]);
  await page.getByRole("button", { name: "Datapacks 6", exact: true }).click();
  await expect(page.locator(".discover-project")).toHaveCount(6);
  await expect(
    page.getByRole("combobox", { name: "Discover loader" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Resource packs 6", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search resource packs" })
    .fill("nothing-matches");
  await expect(
    page.getByRole("heading", { name: "No examples found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search & filters" }).click();
  await expect(page.locator(".discover-project")).toHaveCount(6);
});

test("discovery fits the minimum desktop size in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/#/discover");
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => (document.documentElement.dataset.theme = value),
      theme,
    );
    await expect(page.locator(".discover-project").first()).toHaveCSS(
      "background-color",
      theme === "dark" ? "rgb(37, 40, 47)" : "rgb(255, 255, 255)",
    );
    const bounds = await page
      .locator(".discover-project")
      .first()
      .boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(900);
    await expect(
      page.getByRole("combobox", { name: "Sort projects" }),
    ).toBeVisible();
    await page.screenshot({ path: `/tmp/azuria-discover-${theme}-900.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(page.locator(".discover-project").first()).toHaveCSS(
    "background-color",
    "rgb(37, 40, 47)",
  );
  await page.screenshot({ path: "/tmp/azuria-discover-dark-1280.png" });
});

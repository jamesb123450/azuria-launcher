import { expect, test } from "@playwright/test";
test("keyboard users can skip navigation and use themed library controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page
    .getByRole("button", { name: "Filters & sorting", exact: true })
    .click();
  const sort = page.getByRole("combobox", {
    name: "Sort instances",
    exact: true,
  });
  await sort.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(sort).toHaveText("Name A–Z");
  await expect(sort).toBeFocused();
});
test("polished screens retain their layout at minimum size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/");
  for (const theme of ["dark", "light"]) {
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", {
        name:
          theme === "dark"
            ? "Dark Use the dark theme"
            : "Light Use the light theme",
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator("#main-content").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.mouse.move(880, 20);
    await page.screenshot({
      path: `/tmp/azuria-polish-settings-${theme}.png`,
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Library", exact: true }).click();
    await expect(
      page.getByText("Appearance saved.", { exact: true }),
    ).toHaveCount(0);
    await page.mouse.move(880, 20);
    await page.screenshot({
      path: `/tmp/azuria-polish-library-${theme}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Create instance", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: `/tmp/azuria-polish-create-${theme}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
  }
});

test("populated library remains readable at desktop size", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "azuria-preview-v1",
      JSON.stringify({
        settings: { theme: "dark" },
        instances: [
          "Vanilla Survival",
          "Fabric Workshop",
          "Snapshot Testing",
          "Weekend Multiplayer",
        ].map((name, index) => ({
          id: `00000000-0000-4000-8000-00000000000${index}`,
          name,
          minecraftVersion: "1.21.1",
          loader: index % 2 ? "fabric" : "vanilla",
          memoryMb: 4096,
          favorite: index === 0,
          createdAt: Date.now() - index * 86400000,
        })),
      }),
    ),
  );
  await page.reload();
  await expect(page.locator(".instance-card")).toHaveCount(4);
  await expect(page.locator(".context-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Account & setup", exact: true })
    .click();
  await expect(page.locator(".context-panel")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Account & setup", exact: true })
    .click();
  await expect(page.locator(".context-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Filters & sorting", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Filter instances", exact: true })
    .getByRole("button", { name: "Fabric", exact: true })
    .click();
  await expect(page.locator(".instance-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Filters & sorting", exact: true })
    .click();
  await expect(page.locator("#library-filters")).toHaveCount(0);
  await page.getByRole("button", { name: /Fabric.*Clear filter/ }).click();
  await expect(page.locator(".instance-card")).toHaveCount(4);
  const more = page.getByRole("button", {
    name: "More actions for Vanilla Survival",
    exact: true,
  });
  await more.click();
  await page
    .getByRole("button", {
      name: "Copy settings for Vanilla Survival",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: "/tmp/azuria-polish-populated.png",
    animations: "disabled",
  });
});

test("library states fit both themes at minimum and wide desktop sizes", async ({
  page,
}) => {
  await page.goto("/");
  for (const theme of ["dark", "light"]) {
    for (const count of [0, 1, 8]) {
      await page.evaluate(
        ({ theme, count }) =>
          localStorage.setItem(
            "azuria-preview-v1",
            JSON.stringify({
              settings: { theme },
              instances: Array.from({ length: count }, (_, index) => ({
                id: `state-${index}`,
                name:
                  index === 0
                    ? "Weekend survival with friends"
                    : `Instance ${index}`,
                minecraftVersion: "1.21.1",
                loader: index % 2 ? "fabric" : "vanilla",
                memoryMb: 4096,
                favorite: false,
                createdAt: Date.now() - index * 86400000,
              })),
            }),
          ),
        { theme, count },
      );
      await page.reload();
      for (const width of [900, 1920]) {
        await page.setViewportSize({
          width,
          height: width === 900 ? 650 : 1080,
        });
        await expect(page.locator(".instance-card")).toHaveCount(count);
        await expect(page.locator(".selected-instance")).toHaveCount(
          count ? 1 : 0,
        );
        expect(
          await page
            .locator(".play-main")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        await expect(
          page.getByRole("button", { name: "Create instance", exact: true }),
        ).toBeInViewport();
        if (count)
          await expect(
            page.getByRole("button", { name: "Edit instance", exact: true }),
          ).toBeInViewport();
        await page.screenshot({
          path: `test-results/library-${theme}-${count}-${width}.png`,
        });
      }
    }
  }
});

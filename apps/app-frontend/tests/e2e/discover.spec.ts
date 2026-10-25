import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://piston-meta.mojang.com/**", (route) =>
    route.fulfill({
      json: {
        versions: [
          { id: "26.1", type: "release" },
          { id: "1.21.1", type: "release" },
        ],
      },
    }),
  );
  await page.route("https://api.modrinth.com/v2/search**", (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("query") ?? "";
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return route.fulfill({
      json: {
        total_hits: query === "none" ? 0 : 8,
        hits:
          query === "none"
            ? []
            : Array.from({ length: offset ? 2 : 6 }, (_, n) => ({
                project_id: "p" + (n + offset),
                title: (query || "Project") + " " + (n + offset),
                description: "A provider project description.",
                author: "Provider author",
                slug: "project-" + n,
                downloads: 100 + n,
                categories: ["optimization"],
              })),
      },
    });
  });
});
test("real search UI applies filters and pagination without fictional fallback", async ({
  page,
}) => {
  await page.goto("/#/discover");
  await expect(page.locator(".discover-project")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Install Project 0", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next results page" }).click();
  await expect(page.locator(".discover-project")).toHaveCount(2);
  await page.getByRole("textbox", { name: "Search modpacks" }).fill("none");
  await expect(
    page.getByRole("heading", { name: "No projects found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "CurseForge", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("publisher-configured");
  await expect(
    page.getByRole("link", { name: "CurseForge availability" }),
  ).toBeVisible();
});
test("provider errors can retry without showing sample projects", async ({
  page,
}) => {
  await page.route("https://api.modrinth.com/v2/search**", (route) =>
    route.fulfill({ status: 429, json: {} }),
  );
  await page.goto("/#/discover");
  await expect(page.getByRole("alert")).toContainText("rate limit");
  await page.unroute("https://api.modrinth.com/v2/search**");
  await page.route("https://api.modrinth.com/v2/search**", (route) =>
    route.fulfill({ json: { total_hits: 0, hits: [] } }),
  );
  await page.getByRole("button", { name: "Retry search" }).click();
  await expect(
    page.getByRole("heading", { name: "No projects found" }),
  ).toBeVisible();
});
test("right-hand filters and provider cards fit the minimum window in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 650 });
  await page.goto("/#/discover");
  await expect(page.locator(".discover-project")).toHaveCount(6);
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await page.locator(".discover-results").boundingBox();
    const filters = await page
      .getByRole("complementary", { name: "Discovery filters" })
      .boundingBox();
    expect(filters!.x).toBeGreaterThan(results!.x + results!.width - 1);
    await page.screenshot({ path: `test-results/discover-live-${theme}.png` });
  }
});

test("project actions stay inside each result and clear of the filters", async ({
  page,
}) => {
  await page.goto("/#/discover");
  await expect(page.locator(".discover-project")).toHaveCount(6);
  for (const width of [900, 1100, 1101, 1280, 1588]) {
    await page.setViewportSize({ width, height: 900 });
    const sidebar = await page.locator(".discover-filters").boundingBox();
    for (const row of await page.locator(".discover-project").all()) {
      const bounds = await row.boundingBox();
      for (const action of await row
        .locator(
          ".discover-project-meta .discover-view, .discover-project-meta .discover-install",
        )
        .all()) {
        const box = await action.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          bounds!.x + bounds!.width + 1,
        );
        expect(box!.x + box!.width).toBeLessThan(sidebar!.x);
        const icon = await action.locator("svg").boundingBox();
        expect(icon!.x - box!.x).toBeGreaterThanOrEqual(8);
      }
      const view = await row.locator(".discover-view").boundingBox();
      const install = await row.locator(".discover-install").boundingBox();
      expect(view!.x + view!.width).toBeLessThanOrEqual(install!.x - 7);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("discover-actions.png"),
  });
});

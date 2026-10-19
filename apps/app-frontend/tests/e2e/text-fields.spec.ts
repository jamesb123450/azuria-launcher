import { test, expect, type Locator } from "@playwright/test";
async function themedField(field: Locator) {
  await expect(field).toBeVisible();
  const style = await field.evaluate((element) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--input)";
    element.parentElement!.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const actual = getComputedStyle(element);
    return {
      background: actual.backgroundColor,
      expected,
      color: actual.color,
      border: actual.borderTopStyle,
      radius: parseFloat(actual.borderTopLeftRadius),
    };
  });
  expect(style.background).toBe(style.expected);
  expect(style.color).not.toBe(style.background);
  expect(style.border).toBe("solid");
  expect(style.radius).toBeGreaterThanOrEqual(6);
}
for (const theme of ["dark", "light"] as const) {
  test(`${theme} popup fields retain the app theme, including numeric and multiline arguments`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 900, height: 650 });
    await page.goto("/#/settings");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const popup = page.getByRole("dialog", { name: "Settings", exact: true });
    await popup.getByRole("button", { name: "Storage", exact: true }).click();
    const downloads = popup.getByLabel("Maximum concurrent downloads", {
      exact: true,
    });
    await expect(downloads).toHaveAttribute("type", "range");
    await expect(downloads).toHaveAttribute("max", "10");
    await themedField(
      popup.getByLabel("Keep unused downloads (GiB)", { exact: true }),
    );
    await downloads.focus();
    await expect(downloads).toHaveCSS("outline-style", "solid");
    await page.screenshot({
      path: test.info().outputPath(`storage-fields-${theme}.png`),
    });
    await popup
      .getByRole("button", { name: "Content providers", exact: true })
      .click();
    await expect(popup.getByLabel("API key", { exact: true })).toHaveCount(0);
    await popup
      .getByRole("button", { name: "Java & memory", exact: true })
      .click();
    await themedField(popup.getByLabel("Memory allocation in MB"));
    await themedField(
      popup.getByRole("textbox", { name: "Arguments", exact: true }),
    );
    await popup
      .getByRole("button", { name: "Add variable", exact: true })
      .click();
    await themedField(popup.getByLabel("Variable name 1", { exact: true }));
    await themedField(popup.getByLabel("Variable value 1", { exact: true }));
    await popup
      .getByRole("button", { name: "Game window", exact: true })
      .click();
    await themedField(popup.getByLabel("Width", { exact: true }));
    await themedField(popup.getByLabel("Height", { exact: true }));
    await page.screenshot({
      path: test.info().outputPath(`window-fields-${theme}.png`),
    });
  });
}

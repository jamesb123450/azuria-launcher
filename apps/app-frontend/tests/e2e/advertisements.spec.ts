import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
const path =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
test("sponsors appear only in assigned slots and clicks open the default browser", async ({
  page,
}) => {
  await page.route("https://*.supabase.co/storage/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAY0lEQVR4nO3PQQ3AIADAQMA2npCFjongcVnSU9DOfe74s6UDXjWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgfZX4Ao9JnLFGAAAAAElFTkSuQmCC",
        "base64",
      ),
    }),
  );
  await page.goto("/#/");
  await page.evaluate(
    async ({ path }) => {
      const module = "/src/stores/advertisements.ts";
      const { useAdvertisements } = await import(module);
      const store = useAdvertisements();
      store.url = "https://test.supabase.co";
      store.ads = [
        {
          id: "sponsor",
          title: "Example sponsor",
          image_path: path,
          image_alt: "Example sponsor artwork",
          destination: "https://example.com/offer",
          slots: ["home.top", "social.bottom"],
          ends_at: null,
        },
      ];
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args: any) => {
          if (cmd === "content_open_url")
            (window as any).sponsorOpened = args.url;
        },
      };
    },
    { path },
  );
  await expect(page.locator('[data-ad-slot="home.top"] img')).toHaveAttribute(
    "alt",
    "Example sponsor artwork",
  );
  await expect(page.locator('[data-ad-slot="home.bottom"] img')).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Visit Example sponsor (opens in browser)",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => (window as any).sponsorOpened)).toBe(
    "https://example.com/offer",
  );
  await page.screenshot({ path: test.info().outputPath("home-sponsor.png") });
  await page.goto("/#/social");
  await expect(page.locator('[data-ad-slot="social.bottom"] img')).toHaveCount(
    1,
  );
  await expect(page.locator('[data-ad-slot="social.top"] img')).toHaveCount(0);
  await page.evaluate(async () => {
    const module = "/src/stores/advertisements.ts";
    const { useAdvertisements } = await import(module);
    useAdvertisements().ads[0].ends_at = new Date(
      Date.now() + 250,
    ).toISOString();
  });
  await expect(page.locator('[data-ad-slot="social.bottom"] img')).toHaveCount(
    0,
  );
});
test("admin placement previews save the exact selected slots and UTC schedule", async ({
  page,
}) => {
  await page.goto("/#/");
  const module = fileURLToPath(
    new URL(
      "../../../accounts/frontend/src/admin-advertisements.js",
      import.meta.url,
    ),
  );
  await page.evaluate(
    async ({ module, path }) => {
      const { advertisementsWorkspace } = await import("/@fs" + module);
      const sample = {
        id: "campaign",
        title: "Example sponsor",
        destination: "https://example.com/offer",
        image_path: path,
        image_alt: "Sponsor logo",
        starts_at: "2026-10-25T10:00:00Z",
        ends_at: null,
        enabled: false,
        slots: ["home.top"],
        revision: 1,
      };
      const client = {
        rpc: async (name: string, args: any) => {
          if (name === "sponsor_ads_admin_save") {
            (window as any).savedSponsor = args;
            return { data: sample };
          }
          return { data: [sample] };
        },
        storage: {
          from: () => ({
            getPublicUrl: () => ({
              data: { publicUrl: "https://test.supabase.co/image.png" },
            }),
          }),
        },
      };
      const ui = {
        button: (text: string, action: () => Promise<void>, className = "") => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = text;
          b.className = className;
          b.onclick = () => {
            void action();
          };
          return b;
        },
        paragraph: (text: string) => {
          const p = document.createElement("p");
          p.textContent = text;
          return p;
        },
        fail: (text: string) => {
          throw Error(text);
        },
        message: () => {},
      };
      document.body.replaceChildren(
        await advertisementsWorkspace({ client, ui }),
      );
    },
    { module, path },
  );
  await page.evaluate(() => {
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((el) => el.remove());
    delete document.documentElement.dataset.theme;
    document.body.style.padding = "32px";
    document.body.style.maxWidth = "1100px";
    document.body.style.margin = "auto";
  });
  await page.addStyleTag({
    path: fileURLToPath(
      new URL("../../../accounts/frontend/src/style.css", import.meta.url),
    ),
  });
  await page
    .getByRole("button", { name: "Edit advertisement", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Choose placements · select one or more" }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Social", exact: true })
    .locator("..")
    .getByLabel("Lower square", { exact: true })
    .check();
  await page.getByLabel("Enable campaign", { exact: true }).check();
  await page.screenshot({
    path: test.info().outputPath("admin-advertisement-placements.png"),
  });
  await page
    .getByRole("button", { name: "Save advertisement", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).savedSponsor?.p_ad.slots))
    .toEqual(["home.top", "social.bottom"]);
  const result = await page.evaluate(() => (window as any).savedSponsor);
  expect(result.p_revision).toBe(1);
  expect(result.p_ad.starts_at).toBe("2026-10-25T10:00:00.000Z");
});

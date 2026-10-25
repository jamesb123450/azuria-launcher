import { expect, test, type Page } from "@playwright/test";
async function seed(page: Page) {
  await page.goto("/");
  await page.locator(".friends-placeholder").waitFor();
  await page.evaluate(async () => {
    const friendsPath = "/src/friends-api.ts",
      accountPath = "/src/stores/azuria-account.ts";
    const { friendsApi } = await import(friendsPath);
    const { useAzuriaAccount } = await import(accountPath);
    const entries = [
      {
        kind: "friend",
        account_id: "bob",
        username: "bob",
        display_name: "Bob",
        since: "2026-10-24",
      },
      {
        kind: "friend",
        account_id: "casey",
        username: "casey",
        display_name: "Casey",
        since: "2026-10-24",
      },
    ];
    friendsApi.request = async () => ({
      accountId: "alice",
      entries: [...entries],
      matches: [],
      mutationApplied: false,
      warning: null,
    });
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (
          cmd: string,
          args: { action: string; target: string },
        ) => {
          if (cmd !== "azuria_messages") return null;
          return {
            accountId: "alice",
            securityCode:
              args.action === "history"
                ? "01234567 89ABCDEF 01234567 89ABCDEF 01234567 89ABCDEF 01234567 89ABCDEF"
                : undefined,
            data:
              args.action === "inbox"
                ? [
                    {
                      account_id: "bob",
                      latest_at: "2026-10-24T12:00:00Z",
                      unread: 1,
                    },
                  ]
                : args.action === "history" && args.target === "bob"
                  ? [
                      {
                        id: 1,
                        sender_id: "bob",
                        recipient_id: "alice",
                        body: "Ready for Minecraft?",
                        created_at: "2026-10-24T12:00:00Z",
                        encryption: "encrypted",
                      },
                    ]
                  : args.action === "history"
                    ? []
                    : null,
          };
        },
      },
    });
    useAzuriaAccount().view = {
      supported: true,
      configured: true,
      account: {
        id: "alice",
        email: "alice@example.com",
        username: "alice",
        displayName: "Alice",
      },
    };
  });
}
test("Social has an honest signed-out state and two square ad slots", async ({
  page,
}) => {
  await page.goto("/#/social");
  await expect(
    page.getByRole("heading", { name: "Your friends, right here" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to Azuria" }),
  ).toBeVisible();
  await expect(page.locator(".social-adverts .square-ad")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /Friends/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("Friends and Chats filter contacts and open conversations without a modal", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.getByRole("link", { name: "Open Social", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Select a conversation" }),
  ).toBeVisible();
  await page.getByLabel("Search friends", { exact: true }).fill("CASEY");
  await expect(page.locator(".social-contact")).toHaveCount(1);
  await expect(page.locator(".social-contact")).toContainText("Casey");
  await page.getByRole("tab", { name: "Chats", exact: true }).click();
  await expect(page.locator(".social-contact")).toHaveCount(1);
  await expect(page.locator(".social-contact")).toContainText("Bob");
  await page.getByRole("button", { name: "Message Bob", exact: true }).click();
  await expect(page.getByLabel("Messages", { exact: true })).toContainText(
    "Ready for Minecraft?",
  );
  await expect(
    page.getByRole("dialog", { name: "Friends", exact: true }),
  ).not.toBeVisible();
  await page.screenshot({ path: "/tmp/azuria-social-dark.png" });
  await page.getByRole("button", { name: "Back to friends" }).click();
  await expect(
    page.getByRole("heading", { name: "Select a conversation" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const path = "/src/stores/azuria-account.ts";
    const { useAzuriaAccount } = await import(path);
    useAzuriaAccount().view.account = null;
  });
  await expect(page.locator(".social-contact")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Your friends, right here" }),
  ).toBeVisible();
});
test("Social fits the minimum window in light theme and keeps the composer inside the panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await seed(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.locator(".sidebar-friend").first().click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  const bounds = await page
    .locator(".social-conversation-surface")
    .boundingBox();
  const composer = await page.locator(".message-composer").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator(".social-adverts .square-ad").first(),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/azuria-social-light.png" });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  const active = await page.evaluate(async () => {
    const path = "/src/stores/messages.ts";
    const { useMessages } = await import(path);
    return useMessages().active;
  });
  expect(active).toBe(false);
});

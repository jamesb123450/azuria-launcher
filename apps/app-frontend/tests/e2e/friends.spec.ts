import { expect, test, type Page } from "@playwright/test";
async function setup(page: Page) {
  await page.goto("/");
  await page.locator(".community-sidebar").waitFor();
  await page.evaluate(async () => {
    const apiPath = "/src/friends-api.ts",
      accountPath = "/src/stores/azuria-account.ts";
    const { friendsApi } = await import(apiPath);
    const { useAzuriaAccount } = await import(accountPath);
    let rows = [
      {
        kind: "incoming",
        account_id: "bob",
        username: "bob",
        display_name: "Bob",
        since: "2026-10-20T00:00:00Z",
      },
    ];
    friendsApi.request = async (action: string, target?: string) => {
      if (action === "find")
        return {
          accountId: "alice",
          entries: null,
          matches: [
            {
              id: "charlie",
              username: "charlie",
              display_name: "Charlie",
              relationship: "none",
            },
          ],
          mutationApplied: false,
          warning: null,
        };
      if (action === "accept")
        rows = rows.map((row) =>
          row.account_id === target ? { ...row, kind: "friend" } : row,
        );
      if (action === "send")
        rows.push({
          kind: "outgoing",
          account_id: "charlie",
          username: "charlie",
          display_name: "Charlie",
          since: "2026-10-20T00:00:00Z",
        });
      if (
        action === "cancel" ||
        action === "remove" ||
        action === "decline" ||
        action === "unblock"
      )
        rows = rows.filter((row) => row.account_id !== target);
      if (action === "block")
        rows = rows.map((row) =>
          row.account_id === target ? { ...row, kind: "blocked" } : row,
        );
      return {
        accountId: "alice",
        entries: [...rows],
        matches: [],
        mutationApplied: action !== "snapshot",
        warning: null,
      };
    };
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
test("friends requests, exact lookup, cancelling and block controls work through the panel", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await page.getByRole("button", { name: /friend request waiting/ }).click();
  const dialog = page.getByRole("dialog", { name: "Friends", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Accept bob", exact: true }).click();
  await expect(dialog.getByText("No friend requests waiting.")).toBeVisible();
  await dialog.getByRole("button", { name: "Friends", exact: true }).click();
  await expect(dialog.getByText("Bob", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Block bob", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Block Bob?" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Block account", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Blocked", exact: true }).click();
  await dialog.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(dialog.getByText("No blocked accounts.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add friend", exact: true }).click();
  await dialog.getByLabel("Azuria username").fill("charlie");
  await dialog.getByRole("button", { name: "Find", exact: true }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByRole("button", { name: "Requests", exact: true }).click();
  await expect(dialog.getByText("Charlie", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  await expect(dialog.getByText("No outgoing requests.")).toBeVisible();
  await page.setViewportSize({ width: 900, height: 650 });
  await expect(dialog).toBeInViewport();
  await dialog
    .getByRole("button", { name: "Close friends", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
});
test("signing out clears an open friends dialog and cached names", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Manage friends", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Friends", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const source = "/src/stores/azuria-account.ts";
    const { useAzuriaAccount } = await import(source);
    useAzuriaAccount().view.account = null;
  });
  await expect(
    page.getByRole("dialog", { name: "Friends", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".community-sidebar")).not.toContainText("Bob");
});

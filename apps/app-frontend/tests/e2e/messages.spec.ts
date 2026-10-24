import { expect, test } from "@playwright/test";
test("sidebar opens a conversation, renders plain text and sends with Enter", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".community-sidebar").waitFor();
  await page.evaluate(async () => {
    const friendsPath = "/src/friends-api.ts",
      accountPath = "/src/stores/azuria-account.ts";
    const { friendsApi } = await import(friendsPath);
    const { useAzuriaAccount } = await import(accountPath);
    const rows = [
      {
        id: 1,
        sender_id: "bob",
        recipient_id: "alice",
        body: "<b>Hello</b>",
        encryption: "legacy",
        created_at: "2026-10-24T12:00:00Z",
      },
    ];
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args: { action: string; body: string }) => {
          if (cmd !== "azuria_messages") return null;
          if (args.action === "send")
            rows.push({
              id: 2,
              sender_id: "alice",
              recipient_id: "bob",
              body: args.body,
              encryption: "encrypted",
              created_at: "2026-10-24T12:01:00Z",
            });
          return {
            accountId: "alice",
            securityCode:
              "01234567 89ABCDEF 01234567 89ABCDEF 01234567 89ABCDEF 01234567 89ABCDEF",
            data:
              args.action === "history"
                ? [...rows].reverse()
                : args.action === "send"
                  ? [rows.at(-1)]
                  : args.action === "unread"
                    ? []
                    : null,
          };
        },
      },
    });
    friendsApi.request = async () => ({
      accountId: "alice",
      entries: [
        {
          kind: "friend",
          account_id: "bob",
          username: "bob",
          display_name: "Bob",
          since: "2026-10-24",
        },
      ],
      matches: [],
      mutationApplied: false,
      warning: null,
    });
    useAzuriaAccount().view = {
      supported: true,
      configured: true,
      account: {
        id: "alice",
        email: "a@example.com",
        username: "alice",
        displayName: "Alice",
      },
    };
  });
  await page.locator(".sidebar-friend").click();
  const dialog = page.getByRole("dialog", { name: "Friends", exact: true });
  await expect(dialog.getByLabel("Messages", { exact: true })).toContainText(
    "<b>Hello</b>",
  );
  await expect(dialog.locator(".message-bubble b")).toHaveCount(0);
  await expect(
    dialog.getByText("Older message · Not end-to-end encrypted", {
      exact: true,
    }),
  ).toBeVisible();
  await dialog.locator(".conversation-security summary").click();
  await expect(dialog.locator(".conversation-security code")).toContainText(
    "01234567",
  );
  await dialog.locator(".message-security summary").click();
  await dialog
    .getByLabel("Recovery passphrase", { exact: true })
    .fill("my recovery passphrase");
  await dialog
    .getByRole("button", { name: "Save recovery file", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Encrypted recovery file saved",
  );
  await expect(
    dialog.getByLabel("Recovery passphrase", { exact: true }),
  ).toHaveValue("");
  await dialog.getByLabel("Message", { exact: true }).fill("Hi Bob");
  await dialog.getByLabel("Message", { exact: true }).press("Enter");
  await expect(dialog.locator(".message-bubble.mine")).toContainText("Hi Bob");
  await expect(dialog.getByLabel("Message", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "Back to friends" }).click();
  await expect(
    dialog.getByRole("button", { name: "Message", exact: true }),
  ).toBeVisible();
});

export function authenticatorQrSource(value) {
  const prefix = "data:image/svg+xml;utf-8,";
  const svg = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (!/^<(svg|\?xml)\b/.test(svg.trimStart()))
    throw new Error("Invalid authenticator QR code");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Role visibility is only navigation. All data and actions are checked server-side.
export async function showAdmin({ client, user, ui }) {
  const {
    heading,
    render,
    paragraph,
    button,
    form,
    field,
    message,
    fail,
    check,
  } = ui;
  document.body.classList.add("admin-page");
  heading("Administration", "Azuria Studios · Account management");
  const { data: allowed, error } = await client.rpc("admin_access");
  if (error || !allowed) {
    render(
      paragraph("This account does not have administrator access."),
      back(),
    );
    return;
  }
  function back() {
    return button(
      "Back to your account",
      () => {
        location.href = "/";
      },
      "text-button",
    );
  }
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      fail(
        error.code === "42501"
          ? "Admin access expired or was removed. Verify your password and authenticator again."
          : "Could not load administration data. Check the database setup and try again.",
      );
    return data;
  }
  function verifyPassword() {
    heading(
      "Verify admin access",
      "Confirm your password, then use your authenticator app.",
    );
    render(
      form(
        [field("password", "Your password", "password", "current-password")],
        "Continue",
        async (data) => {
          try {
            const { data: signed, error } =
              await client.auth.signInWithPassword({
                email: user.email,
                password: String(data.get("password")),
              });
            check(error);
            if (signed.user?.id !== user.id)
              fail("Sign in with your administrator account.");
            await verifyAuthenticator();
          } finally {
            document
              .querySelectorAll('input[type="password"]')
              .forEach((input) => {
                input.value = "";
              });
          }
        },
      ),
      back(),
    );
  }
  async function verifyAuthenticator() {
    const { data, error } = await client.auth.mfa.listFactors();
    check(error);
    let factor = data.totp.find((factor) => factor.status === "verified");
    const nodes = [];
    if (!factor) {
      for (const stale of data.all.filter(
        (item) => item.factor_type === "totp" && item.status === "unverified",
      )) {
        const { error } = await client.auth.mfa.unenroll({
          factorId: stale.id,
        });
        check(error);
      }
      const { data: enrollment, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Azuria admin",
        issuer: "Azuria Studios",
      });
      check(error);
      factor = enrollment;
      heading(
        "Set up your authenticator",
        "Scan this code in your authenticator app, then enter its six-digit code.",
      );
      const image = document.createElement("img");
      image.className = "admin-qr";
      image.alt = "Authenticator setup QR code";
      image.src = authenticatorQrSource(enrollment.totp.qr_code);
      const secret = document.createElement("code");
      secret.className = "code";
      secret.textContent = enrollment.totp.secret;
      nodes.push(
        image,
        paragraph("Or enter this setup key manually. Keep it private.", "fine"),
        secret,
      );
    } else
      heading(
        "Authenticator check",
        "Enter the six-digit code from your authenticator app.",
      );
    const codeField = field(
      "code",
      "Authenticator code",
      "text",
      "one-time-code",
    );
    const input = codeField.querySelector("input");
    input.pattern = "[0-9]{6}";
    input.inputMode = "numeric";
    input.maxLength = 6;
    const factorId = factor.id;
    nodes.push(
      form([codeField], "Open administration", async (data) => {
        const { error } = await client.auth.mfa.challengeAndVerify({
          factorId,
          code: String(data.get("code")).trim(),
        });
        check(error);
        await dashboard();
      }),
      back(),
    );
    render(...nodes);
  }
  let search = "",
    offset = 0,
    auditOffset = 0;
  function box(className = "") {
    const node = document.createElement("div");
    node.className = className;
    return node;
  }
  function title(text) {
    const h = document.createElement("h3");
    h.textContent = text;
    return h;
  }
  function date(value) {
    return value ? new Date(value).toLocaleString() : "—";
  }
  async function dashboard() {
    const [stats, accounts, history] = await Promise.all([
      rpc("admin_overview"),
      rpc("admin_accounts", { p_search: search, p_offset: offset }),
      rpc("admin_history", { p_offset: auditOffset }),
    ]);
    heading(
      "Administration",
      "Manage Azuria accounts. All account changes are recorded.",
    );
    const metrics = box("admin-metrics");
    for (const [label, value] of [
      ["Accounts", stats.accounts],
      ["Verified", stats.verified],
      ["Suspended", stats.suspended],
    ]) {
      const metric = box("admin-metric"),
        number = document.createElement("strong");
      number.textContent = String(value);
      metric.append(number, paragraph(label, "fine"));
      metrics.append(metric);
    }
    const filter = form(
      [
        field(
          "search",
          "Find an account by email or username prefix",
          "search",
          "off",
          search,
        ),
      ],
      "Search accounts",
      async (data) => {
        search = String(data.get("search")).trim();
        offset = 0;
        await dashboard();
      },
    );
    filter.querySelector("input").required = false;
    filter.querySelector("input").maxLength = 254;
    const list = box("admin-list");
    list.append(title("Accounts"));
    if (!accounts.length) list.append(paragraph("No accounts found."));
    for (const account of accounts) {
      const row = box("admin-user"),
        details = box();
      details.append(
        title(account.display_name || account.username || "Profile not set up"),
        paragraph(account.email || "No email", "muted"),
        paragraph(
          `${account.username ? "@" + account.username + " · " : ""}${account.id}`,
          "fine",
        ),
        paragraph(
          `Joined ${date(account.created_at)} · ${account.verified ? "Verified" : "Unverified"}${account.is_admin ? " · Admin" : ""}`,
          "fine",
        ),
      );
      const suspended =
        account.banned_until &&
        new Date(account.banned_until).getTime() > Date.now();
      const controls = box("stack");
      controls.append(
        paragraph(
          suspended ? "Suspended" : "Active",
          suspended ? "danger" : "fine",
        ),
      );
      if (account.id !== user.id && !account.is_admin)
        controls.append(
          button(
            suspended ? "Restore account" : "Suspend account",
            () => confirmAction(account, suspended ? "restore" : "suspend"),
            suspended ? "" : "danger",
          ),
        );
      else controls.append(paragraph("Protected account", "fine"));
      row.append(details, controls);
      list.append(row);
    }
    const pages = box("row");
    if (offset > 0)
      pages.append(
        button("Previous accounts", async () => {
          offset = Math.max(0, offset - 25);
          await dashboard();
        }),
      );
    if (accounts.length === 25 && offset < 10000)
      pages.append(
        button("Next accounts", async () => {
          offset += 25;
          await dashboard();
        }),
      );
    list.append(pages);
    const audit = box("admin-list");
    audit.append(title("Account action history"));
    if (!history.length) audit.append(paragraph("No admin actions yet."));
    for (const event of history) {
      const row = box("admin-audit-row");
      row.append(
        paragraph(
          `${event.action === "suspend" ? "Suspend" : "Restore"} · ${event.outcome === "pending" ? "Pending verification" : event.outcome}`,
          event.outcome === "pending" ? "danger" : "",
        ),
        paragraph(event.reason),
        paragraph(`Account ${event.target_id} · By ${event.actor_id}`, "fine"),
        paragraph(`${date(event.created_at)} · Record ${event.id}`, "fine"),
      );
      audit.append(row);
    }
    const auditPages = box("row");
    if (auditOffset > 0)
      auditPages.append(
        button("Previous actions", async () => {
          auditOffset = Math.max(0, auditOffset - 25);
          await dashboard();
        }),
      );
    if (history.length === 25 && auditOffset < 10000)
      auditPages.append(
        button("Next actions", async () => {
          auditOffset += 25;
          await dashboard();
        }),
      );
    audit.append(auditPages);
    const actions = box("row");
    actions.append(
      button("Refresh", dashboard),
      button("Verify access again", verifyPassword),
      back(),
    );
    render(
      metrics,
      filter,
      list,
      audit,
      paragraph(
        "Suspension prevents Azuria sign-in and session renewal. Existing access tokens may work until expiry. Local Minecraft installations are unaffected.",
        "fine",
      ),
      actions,
    );
  }
  function confirmAction(account, action) {
    heading(
      action === "suspend" ? "Suspend this account?" : "Restore this account?",
      `${account.email || account.id} · ${account.username || "No username"}`,
    );
    const reason = field("reason", "Reason for this change", "text", "off");
    reason.querySelector("input").minLength = 5;
    reason.querySelector("input").maxLength = 300;
    const confirmation = field(
      "confirmation",
      "Type the account ID to confirm",
      "text",
      "off",
    );
    render(
      paragraph(`Account ID: ${account.id}`, "fine"),
      form(
        [reason, confirmation],
        action === "suspend" ? "Confirm suspension" : "Confirm restoration",
        async (data) => {
          if (String(data.get("confirmation")).trim() !== account.id)
            fail("The account ID does not match.");
          const { data: result, error } = await client.functions.invoke(
            "admin-action",
            {
              body: {
                action,
                target: account.id,
                reason: String(data.get("reason")).trim(),
              },
            },
          );
          if (error) {
            let response;
            try {
              response = await error.context?.json();
            } catch {}
            fail(
              response?.error ||
                "Could not confirm the result. Check the audit history before retrying.",
            );
          }
          if (!result?.success)
            fail("Could not confirm the result. Check the audit history.");
          await dashboard();
          message(
            action === "suspend" ? "Account suspended." : "Account restored.",
          );
        },
      ),
      button("Cancel", dashboard),
      button("Verify access again", verifyPassword, "text-button"),
    );
  }
  await verifyPassword();
}

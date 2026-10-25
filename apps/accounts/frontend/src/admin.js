import { advertisementsWorkspace } from "./admin-advertisements.js";
import { feedbackWorkspace } from "./admin-feedback.js";
import { newsWorkspace } from "./admin-news.js";
import {
  adminSections,
  plannedTools,
  selectedAdminSection,
  adminIcon,
} from "./admin-dashboard.js";

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
    document.body.classList.remove("admin-dashboard-open");
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
  let page = selectedAdminSection(location.hash);
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
      page === "overview" ? rpc("admin_overview") : Promise.resolve(null),
      page === "accounts"
        ? rpc("admin_accounts", { p_search: search, p_offset: offset })
        : Promise.resolve([]),
      ["overview", "activity"].includes(page)
        ? rpc("admin_history", {
            p_offset: page === "overview" ? 0 : auditOffset,
          })
        : Promise.resolve([]),
    ]);
    heading(
      "Administration",
      "Manage Azuria accounts. All account changes are recorded.",
    );
    const metrics = box("admin-metrics");
    for (const [label, value] of [
      ["Accounts", stats?.accounts ?? 0],
      ["Verified", stats?.verified ?? 0],
      ["Suspended", stats?.suspended ?? 0],
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
    const content = box("admin-workspace-content");
    if (page === "overview") {
      const welcome = box("admin-welcome");
      welcome.append(
        paragraph("AZURIA STUDIOS", "eyebrow"),
        title("Your workspace, at a glance."),
        paragraph("Manage accounts, review changes and keep Azuria moving."),
      );
      const shortcuts = box("admin-shortcuts");
      for (const [label, destination, description] of [
        [
          "Manage accounts",
          "accounts",
          "Find a player or review account access.",
        ],
        ["Review activity", "activity", "See recent account changes."],
        ["Manage news", "news", "Write and publish updates for the launcher."],
        [
          "Launcher feedback",
          "feedback",
          "See what players want from their launcher.",
        ],
      ]) {
        const shortcut = box("admin-shortcut");
        shortcut.append(
          button(label, () => navigate(destination)),
          paragraph(description, "fine"),
        );
        shortcuts.append(shortcut);
      }
      const recent = box("admin-panel");
      recent.append(title("Recent account activity"));
      if (!history.length)
        recent.append(paragraph("No account changes have been recorded yet."));
      for (const event of history.slice(0, 5))
        recent.append(
          paragraph(
            `${event.action === "suspend" ? "Suspend" : "Restore"} · ${event.outcome === "pending" ? "Pending verification" : event.outcome} · ${date(event.created_at)}`,
            "fine",
          ),
        );
      recent.append(
        button("View activity log", () => navigate("activity"), "text-button"),
      );
      const upcoming = box("admin-panel");
      upcoming.append(
        title("More tools on the way"),
        paragraph(
          "Reports, product management, announcements and analytics will live here. Explore each section to see what is planned.",
          "muted",
        ),
      );
      content.append(welcome, metrics, shortcuts, recent, upcoming);
    } else if (page === "accounts")
      content.append(
        filter,
        list,
        paragraph(
          "Suspension prevents Azuria sign-in and session renewal. Existing access tokens may work until expiry. Local Minecraft installations are unaffected.",
          "fine",
        ),
      );
    else if (page === "activity") content.append(audit);
    else if (page === "feedback")
      content.append(await feedbackWorkspace({ client, ui }));
    else if (page === "advertisements")
      content.append(await advertisementsWorkspace({ client, ui }));
    else if (page === "news")
      content.append(await newsWorkspace({ client, ui }));
    else {
      const section = plannedTools[page];
      content.append(
        paragraph(section.description),
        paragraph(
          "Coming soon · These tools are not connected yet.",
          "admin-coming-soon",
        ),
      );
      const tools = box("admin-tool-grid");
      for (const [label, description, action] of section.tools) {
        const tool = box("admin-tool");
        tool.append(
          adminIcon(adminSections.find((item) => item.id === page).icon),
          title(label),
          paragraph(description),
        );
        const control = button(action, null);
        control.disabled = true;
        control.dataset.unavailable = "true";
        control.title = "Coming soon";
        tool.append(control);
        tools.append(tool);
      }
      content.append(tools);
    }
    const navigation = document.createElement("nav");
    navigation.className = "admin-navigation";
    navigation.setAttribute("aria-label", "Administration");
    const identity = box("admin-workspace-brand");
    const mark = document.createElement("img");
    mark.src = "/azuria.png";
    mark.alt = "";
    identity.append(
      mark,
      title("Azuria"),
      paragraph("STUDIO WORKSPACE", "fine"),
    );
    navigation.append(identity);
    let group = "";
    for (const item of adminSections) {
      if (item.group !== group) {
        navigation.append(paragraph(item.group, "admin-nav-group"));
        group = item.group;
      }
      const control = button(
        item.label,
        () => navigate(item.id),
        "admin-nav-item",
      );
      control.prepend(adminIcon(item.icon));
      if (item.id === page) control.setAttribute("aria-current", "page");
      if (item.soon) {
        const badge = document.createElement("span");
        badge.className = "admin-nav-badge";
        badge.textContent = "Soon";
        control.append(badge);
      }
      navigation.append(control);
    }
    const navFooter = box("admin-nav-footer");
    navFooter.append(
      paragraph("Signed in as", "fine"),
      paragraph(user.email, "admin-identity"),
      back(),
    );
    navigation.append(navFooter);
    const workspace = box("admin-workspace"),
      topbar = box("admin-workspace-topbar"),
      pageTitle = box();
    const section = adminSections.find((item) => item.id === page);
    const currentHeading = document.createElement("h2");
    currentHeading.textContent = section.label;
    pageTitle.append(
      paragraph(`Workspace / ${section.label}`, "fine"),
      currentHeading,
    );
    const controls = box("row");
    if (!section.soon) controls.append(button("Refresh", dashboard));
    controls.append(
      button("Verify access", verifyPassword, "text-button"),
      button(
        "Your account",
        () => {
          location.href = "/";
        },
        "text-button",
      ),
    );
    topbar.append(pageTitle, controls);
    workspace.append(topbar, content);
    const shell = box("admin-shell");
    shell.append(navigation, workspace);
    document.body.classList.add("admin-dashboard-open");
    heading(section.label, "Azuria Studios administration");
    render(shell);
    // The dashboard has its own page heading; keep the shared heading for auth/error screens.
    document
      .querySelector(".admin-workspace-topbar h2")
      ?.setAttribute("tabindex", "-1");
  }
  async function navigate(destination) {
    page = destination;
    history.replaceState(null, "", `/admin#${page}`);
    await dashboard();
    document.querySelector(".admin-workspace-topbar h2")?.focus();
  }
  function confirmAction(account, action) {
    document.body.classList.remove("admin-dashboard-open");
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

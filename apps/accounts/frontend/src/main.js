import { createClient } from "@supabase/supabase-js";
import "./style.css";
import { showLauncherHandoff } from "./launcher-handoff.js";
import { showAdmin } from "./admin.js";
import {
  profileError,
  passwordError,
  readHandoff,
  friendlyError,
} from "./validation.js";

const $ = (id) => document.getElementById(id);
const url = import.meta.env.VITE_SUPABASE_URL;
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Browser sessions are scoped to this tab; launcher sessions use the native vault.
const configured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url ?? "") &&
  Boolean(publicKey?.startsWith("sb_publishable_")) &&
  !publicKey.includes("YOUR_");
const client = configured
  ? createClient(url, publicKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        storage: sessionStorage,
        storageKey: "azuria-account",
      },
    })
  : null;
let user = null,
  profile = null,
  busy = false;
let handoff =
  readHandoff(location.hash) || sessionStorage.getItem("azuria-handoff");
if (handoff) sessionStorage.setItem("azuria-handoff", handoff);
const link = new URL(location.href);
const tokenHash = link.searchParams.get("token_hash");
const tokenType = link.searchParams.get("type");
const oauthCode = link.searchParams.get("code");
// Remove transient credentials before showing links or loading account data.
const adminHash =
  location.pathname.replace(/\/$/, "") === "/admin" &&
  /^#(overview|accounts|activity|reports|products|news|analytics|settings)$/.test(
    location.hash,
  )
    ? location.hash
    : "";
history.replaceState(null, "", location.pathname + adminHash);
$("year").textContent = new Date().getFullYear();

function message(text = "", error = false) {
  $("error").hidden = true;
  $("notice").hidden = true;
  if (text) {
    const element = $(error ? "error" : "notice");
    element.textContent = text;
    element.hidden = false;
  }
}
function heading(title, subtitle) {
  $("page-title").textContent = title;
  $("subtitle").textContent = subtitle;
}
function field(name, label, type = "text", autocomplete = "", value = "") {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.required = true;
  input.autocomplete = autocomplete;
  input.value = value;
  if (name === "username") {
    input.pattern = "[a-z0-9_]{3,24}";
    input.minLength = 3;
    input.maxLength = 24;
    input.autocapitalize = "none";
  }
  if (name === "displayName") input.maxLength = 40;
  if (type === "password") {
    input.minLength = autocomplete === "new-password" ? 12 : 1;
    input.maxLength = 128;
  }
  wrapper.append(input);
  return wrapper;
}
function button(text, action, className = "", type = "button") {
  const element = document.createElement("button");
  element.type = type;
  element.textContent = text;
  element.className = className;
  if (action) element.addEventListener("click", () => run(action));
  return element;
}
function form(fields, text, submit) {
  const element = document.createElement("form");
  element.append(...fields, button(text, null, "primary", "submit"));
  element.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(element);
    run(() => submit(data));
  });
  return element;
}
function render(...nodes) {
  $("content").replaceChildren(...nodes);
  $("content").setAttribute("aria-busy", "false");
}
function paragraph(text, className = "muted") {
  const p = document.createElement("p");
  p.textContent = text;
  p.className = className;
  return p;
}
function clearSensitiveFields() {
  document.querySelectorAll('input[type="password"]').forEach((input) => {
    input.value = "";
  });
}
async function run(action) {
  if (busy) return;
  busy = true;
  message();
  document.querySelectorAll("button").forEach((element) => {
    element.disabled = true;
  });
  try {
    await action();
  } catch (error) {
    message(error?.safeMessage || friendlyError(error), true);
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((element) => {
      element.disabled = element.dataset.unavailable === "true";
    });
  }
}
function fail(text) {
  throw { safeMessage: text };
}
function check(error) {
  if (error) throw error;
}
function consentCheckbox(name, required, text) {
  const label = document.createElement("label");
  label.className = "consent-checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.required = required;
  const copy = document.createElement("span");
  copy.textContent = text;
  if (name === "legal") {
    copy.textContent = "I agree to the ";
    for (const [title, path] of [
      ["Terms of service", "/terms/"],
      ["Privacy policy", "/privacy/"],
    ]) {
      const link = document.createElement("a");
      link.href = path;
      link.textContent = title;
      link.target = "_blank";
      link.rel = "noopener";
      copy.append(
        link,
        title === "Terms of service" ? " and " : " (required).",
      );
    }
  }
  label.append(input, copy);
  return label;
}
function authScreen(mode = "signin") {
  document.body.classList.remove("admin-dashboard-open");
  heading(
    mode === "signup"
      ? "Make yourself at home"
      : mode === "recover"
        ? "Forgot your password?"
        : "Welcome back",
    mode === "recover"
      ? "We’ll email you a link to reset it."
      : handoff
        ? "Sign in to connect your Azuria Launcher."
        : "Your account for Azuria Studios.",
  );
  const fields = [field("email", "Email address", "email", "email")];
  if (mode === "signup")
    fields.push(
      field("username", "Azuria username", "text", "username"),
      field("displayName", "Display name", "text", "nickname"),
    );
  if (mode !== "recover")
    fields.push(
      field(
        "password",
        "Password",
        "password",
        mode === "signup" ? "new-password" : "current-password",
      ),
    );
  if (mode === "signup")
    fields.push(
      field("confirm", "Confirm password", "password", "new-password"),
      consentCheckbox("legal", true, ""),
      consentCheckbox(
        "marketing",
        false,
        "Email me Azuria Studios news, updates and offers (optional). Unsubscribe at any time.",
      ),
    );
  const main = form(
    fields,
    mode === "signup"
      ? "Create account"
      : mode === "recover"
        ? "Send recovery email"
        : "Sign in",
    async (data) => {
      const email = String(data.get("email")).trim(),
        password = String(data.get("password") || "");
      try {
        if (mode === "signup") {
          if (data.get("legal") !== "on")
            fail("Accept the terms and privacy policy to create an account.");
          const username = String(data.get("username")).trim().toLowerCase(),
            displayName = String(data.get("displayName")).trim();
          const invalid =
            profileError(username, displayName) ||
            passwordError(password, String(data.get("confirm")));
          if (invalid) fail(invalid);
          const { error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: {
                username,
                display_name: displayName,
                legal_accepted: true,
                marketing_opt_in: data.get("marketing") === "on",
              },
              emailRedirectTo: `${location.origin}/confirm/`,
            },
          });
          check(error);
          authScreen();
          message(
            "Check your inbox to verify your email, then sign in. If you already have an account, sign in or reset your password.",
          );
        } else if (mode === "recover") {
          const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${location.origin}/reset/`,
          });
          check(error);
          message(
            "If an account exists for that email, you’ll receive a recovery link.",
          );
        } else {
          const { data: result, error } = await client.auth.signInWithPassword({
            email,
            password,
          });
          check(error);
          user = result.user;
          await signedInScreen();
        }
      } finally {
        clearSensitiveFields();
      }
    },
  );
  const switches = document.createElement("div");
  switches.className = "stack";
  if (mode === "signin") {
    switches.append(
      button("Forgot password?", () => authScreen("recover"), "text-button"),
      button(
        "Create an Azuria account",
        () => authScreen("signup"),
        "text-button",
      ),
    );
    switches.append(
      button(
        "Resend verification email",
        async () => {
          const input = main.querySelector('input[name="email"]');
          if (!input.reportValidity()) return;
          const { error } = await client.auth.resend({
            type: "signup",
            email: input.value.trim(),
            options: { emailRedirectTo: `${location.origin}/confirm/` },
          });
          check(error);
          message("If verification is needed, a new email is on its way.");
        },
        "text-button",
      ),
    );
  } else
    switches.append(
      button("Back to sign in", () => authScreen(), "text-button"),
    );
  render(main, switches);
}
async function loadProfile() {
  const { data, error } = await client
    .from("profiles")
    .select("username,display_name")
    .eq("id", user.id)
    .maybeSingle();
  check(error);
  profile = data;
}
async function edge(body) {
  const { data, error } = await client.functions.invoke("account-action", {
    body,
  });
  if (error) {
    let response;
    try {
      response = await error.context?.json();
    } catch {}
    fail(response?.error || "The account service is unavailable. Try again.");
  }
  if (data?.error) fail(data.error);
  return data;
}
async function signedInScreen() {
  if (location.pathname.replace(/\/$/, "") === "/admin") {
    return showAdmin({
      client,
      user,
      ui: {
        heading,
        render,
        paragraph,
        button,
        form,
        field,
        message,
        fail,
        check,
      },
    });
  }
  return accountScreen();
}
async function accountScreen() {
  await loadProfile();
  heading("Your account", user.email || "Signed in to Azuria");
  const intro = document.createElement("div");
  intro.className = "profile-header";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = (profile?.display_name || "A").slice(0, 1).toUpperCase();
  intro.append(
    avatar,
    paragraph(
      profile
        ? `${profile.display_name} · @${profile.username}`
        : "Choose your Azuria username to finish setting up.",
    ),
  );
  const profileForm = form(
    [
      field(
        "username",
        "Azuria username",
        "text",
        "username",
        profile?.username || user.user_metadata?.username || "",
      ),
      field(
        "displayName",
        "Display name",
        "text",
        "nickname",
        profile?.display_name || user.user_metadata?.display_name || "",
      ),
    ],
    "Save profile",
    async (data) => {
      const username = String(data.get("username")).trim().toLowerCase(),
        displayName = String(data.get("displayName")).trim();
      const invalid = profileError(username, displayName);
      if (invalid) fail(invalid);
      const { error } = await client
        .from("profiles")
        .upsert(
          { id: user.id, username, display_name: displayName },
          { onConflict: "id" },
        );
      check(error);
      await accountScreen();
      message("Your profile has been saved.");
    },
  );
  const actions = document.createElement("div");
  actions.className = "stack";
  const { data: isAdmin } = await client.rpc("admin_access");
  if (isAdmin)
    actions.append(
      button("Administration", () => {
        location.href = "/admin";
      }),
    );
  if (handoff && profile)
    actions.append(
      button(
        "Connect Azuria Launcher",
        async () => {
          const challenge = handoff;
          const data = await edge({ action: "authorize", challenge });
          handoff = null;
          sessionStorage.removeItem("azuria-handoff");
          showLauncherHandoff({
            code: data.code,
            challenge,
            ui: {
              heading,
              render,
              paragraph,
              button,
              message,
              back: button("Back to account", accountScreen, "text-button"),
            },
          });
        },
        "primary",
      ),
    );
  actions.append(
    button("Change password", passwordScreen),
    button("Sign out other sessions", async () => {
      const { error } = await client.auth.signOut({ scope: "others" });
      check(error);
      message(
        "Other sessions have been signed out. Existing access may last until its current token expires.",
      );
    }),
    button("Sign out", async () => {
      const { error } = await client.auth.signOut({ scope: "local" });
      check(error);
      user = null;
      profile = null;
      authScreen();
    }),
    button("Delete account", deleteScreen, "text-button danger"),
  );
  render(
    intro,
    profileForm,
    actions,
    paragraph(
      "Minecraft accounts, friends and messaging are managed in the launcher.",
      "fine",
    ),
  );
}
function passwordScreen(recovery = false) {
  heading(
    recovery ? "Choose a new password" : "Change password",
    "Use a unique password with at least 12 characters.",
  );
  const fields = recovery
    ? []
    : [field("current", "Current password", "password", "current-password")];
  fields.push(
    field("password", "New password", "password", "new-password"),
    field("confirm", "Confirm new password", "password", "new-password"),
  );
  render(
    form(fields, "Save password", async (data) => {
      try {
        const password = String(data.get("password")),
          invalid = passwordError(password, String(data.get("confirm")));
        if (invalid) fail(invalid);
        if (!recovery) {
          const { error } = await client.auth.signInWithPassword({
            email: user.email,
            password: String(data.get("current")),
          });
          check(error);
        }
        const { error } = await client.auth.updateUser({ password });
        check(error);
        await accountScreen();
        message("Your password has been changed.");
      } finally {
        clearSensitiveFields();
      }
    }),
    button("Back to account", accountScreen, "text-button"),
  );
}
function deleteScreen() {
  heading(
    "Delete your account?",
    "This permanently deletes your Azuria account and profile. Your local Minecraft installations are unaffected.",
  );
  render(
    form(
      [
        field(
          "password",
          "Confirm your password",
          "password",
          "current-password",
        ),
        field("confirmation", "Type DELETE to confirm", "text", "off"),
      ],
      "Permanently delete account",
      async (data) => {
        try {
          if (data.get("confirmation") !== "DELETE")
            fail("Type DELETE to confirm.");
          await edge({
            action: "delete",
            password: String(data.get("password")),
          });
          await client.auth.signOut({ scope: "local" });
          user = null;
          profile = null;
          authScreen();
          message("Your Azuria account has been deleted.");
        } finally {
          clearSensitiveFields();
        }
      },
    ),
    button("Keep my account", accountScreen, "text-button"),
  );
}
function legalPage(type) {
  const privacy = type === "privacy";
  heading(
    privacy ? "Privacy policy" : "Terms of service",
    "Azuria accounts · Azuria Studios",
  );
  const text = document.createElement("div");
  text.className = "legal";
  const sections = privacy
    ? [
        [
          "Your information",
          "We use your email address, account ID, username and display name to provide your account. Supabase handles authentication and database storage. Vercel hosts these account pages.",
        ],
        [
          "Marketing emails",
          "If you tick the optional marketing checkbox, we record your consent and add your verified email address to Resend for Azuria Studios news, updates and offers. You can unsubscribe using the link in any marketing email. Account emails do not depend on marketing consent.",
        ],
        [
          "Passwords and sessions",
          "Your password is handled by the authentication service. The website uses essential browser session storage to keep you signed in within this tab. The launcher keeps its saved sign-in credential in Windows Credential Manager. No advertising or analytics scripts run on these account pages.",
        ],
        [
          "Account connections",
          "Connecting the launcher creates a short-lived, single-use authorization code. The server stores a hash of that code for at least five minutes to limit repeated requests. Codes expire after two minutes; older records are removed when new codes are issued.",
        ],
        [
          "Friends",
          "We store friend requests, accepted friendships and accounts you block. Other people can see your Azuria username and display name when finding or connecting with you. Your email address is not shared with friends. We store direct message text, sender and recipient account IDs, send times and read times in Supabase to provide conversations between accepted friends. Messages are not end-to-end encrypted; authorised database operators can access them. Blocking or removing a friend stops access to the conversation; adding them again restores access to its history. Messages remain until an account involved is deleted or you ask us to delete the data. Online status is not included yet.",
        ],
        [
          "Administration",
          "Authorised Azuria administrators can view account identifiers, email addresses, verification and suspension status to manage accounts and investigate abuse. Account changes record the administrator and affected account IDs, reason, action and outcome. This history may remain after account deletion for security and accountability.",
        ],
        [
          "Your choices",
          "You can edit your profile, revoke other sessions or delete your account from these pages. Deletion removes your active account and profile; service security records and backups may follow the providers’ retention schedules.",
        ],
        [
          "Contact",
          "For account or privacy questions, use the contact options on azuriasmp.org.",
        ],
      ]
    : [
        [
          "Your account",
          "Azuria accounts are provided by Azuria Studios. Use an email address you control, keep your password private and provide accurate account information.",
        ],
        [
          "Acceptable use",
          "Do not impersonate others, attempt to access accounts without permission, automate abusive requests or interfere with the service. We may restrict accounts used for abuse.",
        ],
        [
          "Availability",
          "Features may change and the service may be interrupted for maintenance or faults. Some features are introduced gradually. Messaging is available between accepted friends in supported launcher builds.",
        ],
        [
          "Minecraft",
          "Azuria accounts do not provide a Minecraft licence. Microsoft authentication and access to Minecraft remain separate. Azuria is not affiliated with Mojang or Microsoft.",
        ],
        [
          "Closing your account",
          "You can delete your account in account settings. Your statutory rights are unaffected by these terms.",
        ],
        [
          "Contact",
          "For account questions, use the contact options on azuriasmp.org.",
        ],
      ];
  for (const [title, body] of sections) {
    const h = document.createElement("h3");
    h.textContent = title;
    text.append(h, paragraph(body));
  }
  render(
    text,
    button(
      "Back to account",
      () => {
        location.href = "/";
      },
      "text-button",
    ),
  );
}
async function boot() {
  if (/^\/(privacy|terms)\/?$/.test(location.pathname)) {
    legalPage(location.pathname.includes("privacy") ? "privacy" : "terms");
    return;
  }
  if (!client) {
    heading(
      "Accounts are being set up",
      "Azuria account registration will be available once the service is configured.",
    );
    render(paragraph("Minecraft sign-in remains available in the launcher."));
    return;
  }
  if (
    tokenHash &&
    ["signup", "recovery", "email_change", "email"].includes(tokenType)
  ) {
    heading("Confirm your email", "Continue to verify the link.");
    render(
      button(
        "Continue",
        async () => {
          const { data, error } = await client.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType,
          });
          check(error);
          user = data.user;
          if (tokenType === "recovery") passwordScreen(true);
          else {
            await accountScreen();
            message("Your email has been verified.");
          }
        },
        "primary",
      ),
      button("Request a new link", () => authScreen("recover"), "text-button"),
    );
    return;
  }
  if (oauthCode) {
    const { data, error } = await client.auth.exchangeCodeForSession(oauthCode);
    check(error);
    user = data.user;
    if (location.pathname.startsWith("/reset")) {
      passwordScreen(true);
      return;
    }
  }
  const { data, error } = await client.auth.getUser();
  if (!error && data.user) {
    user = data.user;
    await signedInScreen();
  } else authScreen();
}
boot().catch((error) => {
  if (client) authScreen();
  message(friendlyError(error), true);
});
// Keep stale tabs from acting on an account after a refresh/sign-out event.
client?.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    user = null;
    profile = null;
    if (!/^\/(privacy|terms)/.test(location.pathname)) authScreen();
  }
});

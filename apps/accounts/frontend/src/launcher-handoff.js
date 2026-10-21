const codePattern = /^[A-Za-z0-9_-]{43}$/;
export function launcherReturnURL(code, challenge) {
  if (!codePattern.test(code || "") || !codePattern.test(challenge || ""))
    throw new Error("Invalid launcher connection response");
  const url = new URL("azuria://auth/callback");
  url.searchParams.set("code", code);
  url.searchParams.set("state", challenge);
  return url.href;
}
export function showLauncherHandoff({
  code,
  challenge,
  ui,
  open = (href) => location.assign(href),
}) {
  const { heading, render, paragraph, button, message, back } = ui;
  const href = launcherReturnURL(code, challenge);
  heading(
    "Return to Azuria",
    "Approve your browser’s prompt to open Azuria Launcher.",
  );
  const launch = button("Open Azuria Launcher", () => open(href), "primary");
  const fallback = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Use a connection code instead";
  const value = document.createElement("code");
  value.className = "code";
  value.textContent = code;
  fallback.append(
    summary,
    paragraph(
      "If the launcher did not open, paste this code into the launcher you started from. It expires in two minutes.",
    ),
    value,
    button("Copy code", async () => {
      try {
        await navigator.clipboard.writeText(code);
        message("Copied. Return to Azuria Launcher.");
      } catch {
        message("Select the code above and copy it.");
      }
    }),
  );
  render(
    launch,
    paragraph(
      "Once connected, you can close this tab. If your launcher was closed, reopen it and start sign-in again.",
    ),
    fallback,
    paragraph(
      "Only connect the launcher you started from. Never share a connection code.",
      "fine",
    ),
    back,
  );
  // Some browsers require another click after the network request. The explicit
  // Open button remains visible; do not claim success without a native response.
  try {
    open(href);
  } catch {
    message("Click Open Azuria Launcher to continue.");
  }
}

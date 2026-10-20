export const usernamePattern = /^[a-z0-9_]{3,24}$/;
export function profileError(username, displayName) {
  if (!usernamePattern.test(username))
    return "Use 3–24 lowercase letters, numbers or underscores for your username.";
  if (!displayName.trim() || displayName.trim().length > 40)
    return "Choose a display name between 1 and 40 characters.";
  return "";
}
export function passwordError(password, confirmation) {
  if (password.length < 12 || password.length > 128)
    return "Use a password between 12 and 128 characters.";
  if (password !== confirmation) return "Your passwords don’t match.";
  return "";
}
export function readHandoff(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const challenge = params.get("challenge");
  return /^[A-Za-z0-9_-]{43}$/.test(challenge ?? "") ? challenge : null;
}
export function friendlyError(error) {
  const code = error?.code;
  if (code === "23505")
    return "That username is already taken. Choose another.";
  if (code === "invalid_credentials")
    return "Your email or password wasn’t recognised.";
  if (code === "email_not_confirmed")
    return "Verify your email before signing in. You can resend the verification email below.";
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  )
    return "Too many attempts. Wait a little before trying again.";
  if (code === "otp_expired")
    return "That link has expired or has already been used. Request a new one.";
  return "We couldn’t complete that request. Check your connection and try again.";
}

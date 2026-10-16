## Changes

- Added Microsoft sign-in through your default browser with secure PKCE authentication.
- Added Minecraft account controls in Settings: sign in, reconnect, switch account, cancel and sign out.
- Added Xbox authentication, Java Edition entitlement checks and Minecraft profile verification.
- Saved refresh credentials securely in Windows Credential Manager, with automatic reconnection at startup.
- Added clear progress and errors for expired sessions, account restrictions, connection failures and Minecraft Services access issues.
- Preserved the previous account when switching fails or is cancelled, and retained rotated refresh credentials when later verification fails.
- Linked the sidebar and library account controls to account settings while preserving Azuria’s existing theme.

## Update information

Install through Settings → Update & restart, then open Settings → Minecraft account to sign in. This update does not change the instance database schema.

Sign-in requires the Windows desktop app and a personal Microsoft account with Minecraft Java Edition access. Signing out removes Azuria’s saved account; your browser may remain signed in to Microsoft.

This is a development release. Live Minecraft Services access for Azuria’s client ID still requires verification. The Entra registration must support personal Microsoft accounts and a desktop http://localhost redirect. Game installation and Minecraft launching remain in development.

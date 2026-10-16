## Changes

- Fixed Sign in with Microsoft opening Documents or File Explorer instead of the default browser on Windows.
- Opened the complete Microsoft authorization URL through Windows’ registered browser handler, preserving its PKCE and callback parameters.
- Added browser-opening error checks so failed launches show a retryable error in Azuria.

## Update information

Install through Settings → Update & restart, then retry Settings → Minecraft account → Sign in with Microsoft. Cancel any previous pending sign-in first.

This update does not change saved instances, the database schema or stored account credentials. Your default browser should open the Microsoft sign-in page.

This is a development release. Live Microsoft/Xbox/Minecraft sign-in still requires verification with Azuria’s Entra registration. Game installation and Minecraft launching remain in development.

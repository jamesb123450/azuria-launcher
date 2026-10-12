import { defineConfig } from '@playwright/test'
export default defineConfig({ testDir: './tests/e2e', timeout: 30000, use: { baseURL: 'http://localhost:1420', browserName: 'chromium', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' }, webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://localhost:1420', reuseExistingServer: !process.env.CI } })

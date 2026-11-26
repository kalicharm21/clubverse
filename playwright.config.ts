import fs from 'node:fs';
import {defineConfig, devices} from '@playwright/test';

const containerChromiumPath = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync(containerChromiumPath) ? containerChromiumPath : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? {launchOptions: {executablePath}} : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/v1/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

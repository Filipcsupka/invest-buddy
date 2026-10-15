import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

// Fixture project: the standalone build with DATA_MODE=fixture, no database. Run `npm run build` first.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    colorScheme: "light",
  },
  projects: [{ name: "fixture", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `sh -c "mkdir -p .next/standalone/.next && rm -rf .next/standalone/.next/static && cp -R .next/static .next/standalone/.next/static && (test ! -d public || cp -R public .next/standalone/public) && HOSTNAME=127.0.0.1 PORT=${port} node .next/standalone/server.js"`,
    url: `http://127.0.0.1:${port}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { DATA_MODE: "fixture", NODE_ENV: "production" },
  },
});

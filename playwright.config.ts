import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROME_PATH ||
        (process.platform === "darwin"
          ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
          : undefined),
    },
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/supabase.mjs",
      url: "http://127.0.0.1:43219",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      env: {
        BRAIN_TEST_BUILD: "1",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:43219",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-fixture-key",
        APP_URL: "http://localhost:3100",
        SUPABASE_SERVICE_ROLE_KEY: "test-fixture-key",
        OPENAI_API_KEY: "test-fixture-key",
        COMPOSIO_API_KEY: "test-fixture-key",
        CRON_SECRET: "test-fixture-secret",
      },
    },
  ],
  reporter: "list",
});

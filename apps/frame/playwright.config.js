import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4311",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/ui-server.js",
    url: "http://127.0.0.1:4311/api/state",
    reuseExistingServer: false,
    timeout: 15000,
  },
  reporter: "list",
});

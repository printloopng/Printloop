import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";
export const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? "whsec_scratch_only";
const landingPort = process.env.E2E_LANDING_PORT ?? "3000";

export const APPS = {
  landing: `http://localhost:${landingPort}`,
  customer: "http://localhost:3001",
  shop: "http://localhost:3002",
  backoffice: "http://localhost:3003",
};

const reuse = process.env.E2E_REUSE === "1";
const apiDir = path.resolve(__dirname, "..", "..", "printloop-api");

function app(name: keyof typeof APPS, probe: string) {
  return {
    command: name === "landing" ? `pnpm --filter @printloop/landing exec next start --port ${landingPort}` : `pnpm --filter @printloop/${name} start`,
    cwd: path.resolve(__dirname, ".."),
    url: `${APPS[name]}${probe}`,
    reuseExistingServer: reuse,
    timeout: 120_000,
  };
}

const only = (process.env.E2E_APPS ?? "customer,shop,backoffice,landing").split(",") as Array<keyof typeof APPS>;

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node -r ts-node/register/transpile-only -r tsconfig-paths/register src/index.ts",
      cwd: apiDir,
      url: `${API_URL}/health`,
      reuseExistingServer: reuse,
      stdout: process.env.E2E_API_LOGS === "1" ? ("pipe" as const) : ("ignore" as const),
      timeout: 180_000,
      env: {
        PORT: "4000",
        DATABASE_URL: "",
        DATABASE_FILE: path.join(os.tmpdir(), `printloop-e2e-${Date.now()}.sqlite`),
        SEED_DEMO: "1",
        PRINT_DISPATCH_MODE: "kiosk-pull",
        REDIS_URL: "",
        REDIS_HOST: "",
        SMTP_HOST: "",
        TERMII_API_KEY: "",
        CLOUDINARY_CLOUD_NAME: "",
        PAYSTACK_SECRET_KEY: "",
        PAYSTACK_WEBHOOK_SECRET: WEBHOOK_SECRET,
        PUBLIC_BASE_URL: API_URL,
        DISABLE_RATE_LIMIT: "1",
        CUSTOMER_APP_URL: APPS.customer,
        SHOP_APP_URL: APPS.shop,
        BACKOFFICE_URL: APPS.backoffice,
        LANDING_URL: APPS.landing,
        ALLOWED_ORIGINS: Object.values(APPS).join(","),
      },
    },
    ...only.map((name) => app(name, name === "landing" ? "/" : "/login")),
  ],
});

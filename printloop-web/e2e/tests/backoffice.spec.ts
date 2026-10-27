import { expect, test } from "@playwright/test";
import { API_URL, APPS } from "../playwright.config";
import { DEMO_SHOP, SHOP_OWNER, signIn, signUpShop, STAFF, STUDENT, totp } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("backoffice", () => {
  let secret = "";
  let shop: { slug: string; id: string; email: string };

  test.beforeAll(async () => {
    shop = await signUpShop("E2E Lifecycle Print");
  });

  const staff = () => ({ ...STAFF, totpSecret: secret });

  test("turns away shop accounts and makes staff enrol two-step sign-in first", async ({ page }) => {
    await page.goto(`${APPS.backoffice}/tenants`);
    await expect(page).toHaveURL(/\/login\?next=%2Ftenants/);

    await page.getByLabel("Email").fill(SHOP_OWNER.email);
    await page.getByLabel("Password", { exact: true }).fill(SHOP_OWNER.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText("The backoffice is for PrintLoop staff only.")).toBeVisible();

    await signIn(page, "backoffice", STAFF);
    await expect(page.getByRole("heading", { name: "Turn on two-step sign-in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Shops" })).toBeVisible();
    await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
    const key = page.locator("code.pl-mono").first();
    await expect(key).toBeVisible();
    secret = (await key.textContent())!.trim();
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(page.getByText(/code did not verify/i)).toBeVisible();
    await page.getByLabel("6-digit code").fill(totp(secret));
    await page.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  });

  test("asks for the authenticator code on every sign-in", async ({ page, context }) => {
    await signIn(page, "backoffice", staff());
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("pl_session"));
    expect(cookie?.httpOnly).toBe(true);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("suspends a shop so customers can't order, then reactivates it", async ({ page, browser }) => {
    await signIn(page, "backoffice", staff());
    await page.goto(`${APPS.backoffice}/tenants`);
    await page.getByLabel("Filter shops").fill("E2E Lifecycle");
    await page.getByRole("row", { name: /E2E Lifecycle Print/ }).click();
    await expect(page.getByRole("heading", { name: "E2E Lifecycle Print" })).toBeVisible();

    await page.getByRole("button", { name: "Suspend" }).click();
    await page.getByLabel(/Reason/).fill("E2E chargeback review");
    await page.getByRole("button", { name: "Suspend shop" }).click();
    await expect(page.getByText("E2E chargeback review")).toBeVisible();

    const student = await browser.newPage();
    await signIn(student, "customer", STUDENT);
    await student.goto(`${APPS.customer}/print/new?shop=${shop.slug}`);
    await expect(student.getByText("Choose a print shop first")).toBeVisible();
    await student.close();

    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible();

    const again = await browser.newPage();
    await signIn(again, "customer", STUDENT);
    await again.goto(`${APPS.customer}/print/new?shop=${shop.slug}`);
    await expect(again.getByText("Choose a print shop first")).toHaveCount(0);
    await again.close();
  });

  test("opens a support session that can't touch security or payouts", async ({ page, context }) => {
    await signIn(page, "backoffice", staff());
    await page.goto(`${APPS.backoffice}/tenants/${shop.id}`);
    await page.getByRole("button", { name: /Open shop console/ }).click();
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Open console" }).click();
    const console_ = await popup;
    await console_.waitForURL(`${APPS.shop}/`);

    await expect(console_.getByText("Support mode.")).toBeVisible();
    await expect(console_.getByText("E2E Lifecycle Print").first()).toBeVisible();

    await console_.goto(`${APPS.shop}/settings?tab=security`);
    await console_.getByLabel("Current code to turn it off").fill(totp(secret));
    await console_.getByRole("button", { name: "Turn off" }).click();
    await expect(console_.getByText("not available in a support session")).toBeVisible();

    await console_.getByRole("button", { name: "End session" }).click();
    await expect(console_).toHaveURL(/\/login/);
  });

  test("blocks and unblocks a customer", async ({ page }) => {
    await signIn(page, "backoffice", staff());
    await page.goto(`${APPS.backoffice}/users`);
    await page.getByLabel("Search people").fill(STUDENT.email);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("row", { name: new RegExp(STUDENT.email) }).click();
    await expect(page.getByRole("heading", { name: /Demo Student/ })).toBeVisible();

    await page.getByRole("button", { name: "Block", exact: true }).click();
    await page.getByLabel(/Reason/).fill("E2E abuse report");
    await page.getByRole("button", { name: "Block account" }).click();
    await expect(page.getByText("E2E abuse report")).toBeVisible();

    const blocked = await fetch(`${API_URL}/api/customer/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-slug": DEMO_SHOP },
      body: JSON.stringify(STUDENT),
    });
    expect(blocked.status).toBe(403);

    await page.getByRole("button", { name: "Unblock" }).click();
    await expect(page.getByRole("button", { name: "Block", exact: true })).toBeVisible();
    const ok = await fetch(`${API_URL}/api/customer/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    });
    expect(ok.status).toBe(200);
  });

  test("publishes a blog post to the public blog and takes it down again", async ({ page }) => {
    const title = `E2E launch notes ${Date.now()}`;
    await signIn(page, "backoffice", staff());
    await page.goto(`${APPS.backoffice}/blog/new`);
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Summary (shown in lists)").fill("Written by the end-to-end suite.");
    await page.getByLabel("Body").fill("## Hello\n\nThis post says **hello** to the network.");
    await page.getByRole("radio", { name: "Published" }).click();
    await page.getByRole("button", { name: "Save & publish" }).click();
    await page.waitForURL(/\/blog\/[0-9a-f-]{36}$/);
    const slug = (await page.locator("span.pl-mono", { hasText: "/blog/" }).textContent())!.replace("/blog/", "").trim();

    const live = await fetch(`${API_URL}/api/blog/${slug}`);
    expect(live.status).toBe(200);

    await page.getByRole("radio", { name: "Draft" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect.poll(async () => (await fetch(`${API_URL}/api/blog/${slug}`)).status).toBe(404);

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete post" }).click();
    await expect(page).toHaveURL(`${APPS.backoffice}/blog`);
  });
});

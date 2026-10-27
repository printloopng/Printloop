import { expect, test } from "@playwright/test";
import { API_URL, APPS } from "../playwright.config";
import { api, apiLogin, DEMO_SHOP, payJob, pdf, SHOP_ADMIN, SHOP_OWNER, signIn, STUDENT } from "./helpers";

test.describe.configure({ mode: "serial" });

async function uploadJob(token: string, name: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(await pdf(3, name))], { type: "application/pdf" }), name);
  form.append("printConfiguration", JSON.stringify({ copies: 1, paper: "A4", color: "bw", sided: "single", qualityDpi: 300 }));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API_URL}/api/customer/print-jobs`, { method: "POST", headers: { authorization: `Bearer ${token}`, "x-tenant-slug": DEMO_SHOP }, body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${body?.message}`);
  return body.data.job as { id: string; cost: number };
}

async function quote(token: string, pageCount: number): Promise<number> {
  const res = await fetch(`${API_URL}/api/customer/print-jobs/quote`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-tenant-slug": DEMO_SHOP, "content-type": "application/json" },
    body: JSON.stringify({ pageCount, printConfiguration: { copies: 1, paper: "A4", color: "bw", sided: "single", qualityDpi: 300 } }),
  });
  return (await res.json()).data.cost as number;
}

test.describe("shop console", () => {
  let student = "";
  test.beforeAll(async () => {
    student = await apiLogin(STUDENT);
  });

  test("keeps signed-out visitors out and greets the owner with their shop", async ({ page, context }) => {
    await page.goto(`${APPS.shop}/queue`);
    await expect(page).toHaveURL(/\/login\?next=%2Fqueue/);
    await signIn(page, "shop", SHOP_OWNER);
    await expect(page.getByText("Campus Print Hub").first()).toBeVisible();
    await expect(page.getByText("owner", { exact: true })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("pl_session"));
    expect(cookie?.httpOnly).toBe(true);
  });

  test("runs the queue: a paid job appears, is printed, then collected", async ({ page }) => {
    const job = await uploadJob(student, "queue-run.pdf");
    await payJob(job.id, job.cost);
    await signIn(page, "shop", SHOP_OWNER, "/queue");
    const row = page.getByRole("row", { name: /queue-run\.pdf/ });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Print now" }).click();
    await expect(page.getByText("Sent to the printer.")).toBeVisible();

    await page.getByRole("tab", { name: /^Printing/ }).click();
    const printing = page.getByRole("row", { name: /queue-run\.pdf/ });
    await expect(printing).toBeVisible();
    await printing.getByRole("button", { name: "Mark collected" }).click();
    await page.getByRole("tab", { name: /^Finished/ }).click();
    await expect(page.getByRole("row", { name: /queue-run\.pdf/ })).toBeVisible();
  });

  test("shows a price change in the very next customer quote", async ({ page }) => {
    const before = await quote(student, 2);
    await signIn(page, "shop", SHOP_OWNER, "/catalogue");
    const row = page.getByRole("row").filter({ hasText: "A4" }).filter({ hasText: "Black & white" }).first();
    await row.getByLabel("Standard · 300 dpi single-sided").fill("123");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("A4 B&W prices saved.")).toBeVisible();
    expect(await quote(student, 2)).toBe(246);
    expect(before).not.toBe(246);
  });

  test("lets the owner manage the team while admins can only add staff", async ({ page, browser }) => {
    const email = `team-${Date.now()}@example.com`;
    await signIn(page, "shop", SHOP_OWNER, "/team");
    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Staffer");
    await page.getByRole("dialog").getByLabel("Role").selectOption("staff");
    await page.getByRole("button", { name: "Add to team" }).click();
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();

    await row.getByLabel("Role for E2E Staffer").selectOption("admin");
    await expect(page.getByText("E2E Staffer is now admin.")).toBeVisible();

    const adminPage = await browser.newPage();
    await signIn(adminPage, "shop", SHOP_ADMIN, "/team");
    await adminPage.getByRole("button", { name: "Add member" }).click();
    await expect(adminPage.getByRole("dialog").getByLabel("Role").locator("option")).toHaveCount(1);
    await adminPage.close();

    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("row", { name: new RegExp(email) })).toHaveCount(0);
  });

  test("saves branding that customers see, and guards the payout form", async ({ page }) => {
    await signIn(page, "shop", SHOP_OWNER, "/settings?tab=branding");
    await page.getByLabel("Display name").fill("Campus Print Hub E2E");
    await page.getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
    const branding = await (await fetch(`${API_URL}/api/branding`, { headers: { "x-tenant-slug": DEMO_SHOP } })).json();
    expect(branding.data.branding.wordmark).toBe("Campus Print Hub E2E");

    await page.getByRole("tab", { name: "Payouts" }).click();
    const save = page.getByRole("button", { name: "Save account" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
    await page.getByLabel("Account number").fill("12345");
    await expect(page.getByText("10 digits")).toBeVisible();
    await expect(save).toBeDisabled();
  });

  test("runs Edit & Print: shop edits live, customer reviews and approves, then pays", async ({ page, browser }) => {
    await signIn(page, "shop", SHOP_OWNER, "/catalogue");
    await page.getByRole("tab", { name: "Editing fees" }).click();
    const offer = page.getByLabel("Offer Edit & Print");
    if (!(await offer.isChecked())) await offer.check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Editing fees saved.")).toBeVisible();

    const job = await uploadJob(student, "edit-me.pdf", { editingRequired: "true", editingInstructions: "Fix the title page" });
    await page.goto(`${APPS.shop}/edits`);
    await page.getByRole("row", { name: /edit-me\.pdf/ }).click();
    await expect(page.getByText("Fix the title page").first()).toBeVisible();
    await page.getByRole("button", { name: "Open editor" }).click();
    await page.waitForURL(/\/editor\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: /^Editing/ })).toBeVisible();
    const send = page.getByRole("button", { name: "Send to customer" });
    await expect(send).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await send.click();
    await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/\/edits/, { timeout: 60_000 });

    const customer = await browser.newPage();
    await signIn(customer, "customer", STUDENT, `/jobs/${job.id}/edit?shop=${DEMO_SHOP}`);
    await expect(customer.getByRole("heading", { name: "Review your edited document" })).toBeVisible();
    await customer.getByRole("button", { name: /Approve & pay/ }).click();
    await expect(customer.getByText(/Approved/).first()).toBeVisible();

    const mine = await api<{ jobs: Array<{ id: string; cost: number }> }>("/customer/print-jobs", student);
    const approved = mine.jobs.find((j) => j.id === job.id)!;
    await payJob(job.id, approved.cost);
    await customer.goto(`${APPS.customer}/jobs/${job.id}`);
    await expect(customer.getByText("Print code")).toBeVisible();
    await customer.close();
  });
});

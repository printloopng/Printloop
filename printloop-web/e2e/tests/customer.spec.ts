import { expect, test } from "@playwright/test";
import { APPS } from "../playwright.config";
import { api, apiLogin, payJob, pdf, seedNearbyShops, signIn, STUDENT } from "./helpers";

test.describe("customer app", () => {
  test.beforeAll(seedNearbyShops);

  test("redirects signed-out visitors and keeps the session cookie httpOnly", async ({ page, context }) => {
    await page.goto(`${APPS.customer}/jobs`);
    await expect(page).toHaveURL(/\/login\?next=%2Fjobs/);
    await signIn(page, "customer", STUDENT, "/jobs");
    await expect(page.getByRole("heading", { name: "Every print, recorded." })).toBeVisible();
    const cookie = (await context.cookies()).find((c) => c.name.endsWith("pl_session"));
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("pl_session");
  });

  test("finds a shop, prints a page range, pays and gets a code", async ({ page }) => {
    await signIn(page, "customer", STUDENT);
    await page.goto(`${APPS.customer}/shops`);
    const card = page.getByRole("listitem").filter({ hasText: "Express Laser Prints" });
    await card.getByRole("link", { name: "Print here" }).click();
    await expect(page.getByRole("link", { name: /Express Laser Prints/ }).first()).toBeVisible();

    await page.goto(`${APPS.customer}/print/new?shop=legacy`);
    await page.locator('input[type="file"]').setInputFiles({ name: "thesis.pdf", mimeType: "application/pdf", buffer: await pdf(4) });
    await expect(page.getByText("4 pages detected")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Choose pages" }).click();
    await page.getByLabel(/Pages to print/).fill("1-2");
    await expect(page.getByText(/Printing · 2 pages/)).toBeVisible();
    await expect(page.locator('canvas[aria-label="Page 2"]')).toBeVisible();
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByText("1-2 (2)")).toBeVisible();
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);

    const jobId = page.url().split("/").pop()!;
    const token = await apiLogin(STUDENT);
    const jobs = await api<{ jobs: Array<{ id: string; cost: number; printConfiguration: { pageRange?: string } }> }>("/customer/print-jobs", token);
    const job = jobs.jobs.find((j) => j.id === jobId)!;
    expect(job.printConfiguration.pageRange).toBe("1-2");
    await payJob(jobId, job.cost);

    await page.reload();
    await expect(page.getByText("Print code")).toBeVisible();
    await expect(page.getByText("pp. 1-2 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Send to printer" }).first().click();
    await expect(page.getByRole("dialog", { name: "Send to a printer" })).toBeVisible();
    await expect(page.getByRole("radio").first()).toBeVisible();
  });

  test("runs a group: share link, guest joins and uploads", async ({ page, browser }) => {
    await signIn(page, "customer", STUDENT);
    await page.goto(`${APPS.customer}/?shop=express-laser`);
    await page.goto(`${APPS.customer}/groups`);
    await page.getByLabel("Group name").fill("E2E binding");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    const link = await page.locator("span.pl-mono", { hasText: "/join/" }).textContent();
    expect(link).toContain("/join/");

    const guest = await browser.newPage();
    await guest.goto(link!);
    await guest.getByLabel("Your name").fill("Guest Student");
    await guest.getByLabel("Email").fill(`guest+${Date.now()}@example.com`);
    await guest.getByRole("button", { name: "Join" }).click();
    await guest.locator('input[type="file"]').setInputFiles({ name: "chapter.pdf", mimeType: "application/pdf", buffer: await pdf(2) });
    await guest.getByRole("button", { name: "Upload" }).click();
    await expect(guest.getByRole("heading", { name: "Pay for your document" })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Guest Student").first()).toBeVisible();
    await expect(page.getByText("Unpaid").first()).toBeVisible();
    await guest.close();
  });
});

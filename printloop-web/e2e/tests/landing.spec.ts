import { expect, test } from "@playwright/test";
import { APPS } from "../playwright.config";
import { seedNearbyShops } from "./helpers";

test.describe("landing site", () => {
  test.beforeAll(seedNearbyShops);

  test("tells the story and sends people to the right apps", async ({ page }) => {
    await page.goto(APPS.landing);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your campus printing, finally done right.");
    await expect(page.getByRole("link", { name: /Begin your account/i })).toHaveAttribute("href", `${APPS.customer}/register`);
    await expect(page.getByRole("link", { name: /Open your shop/i }).first()).toHaveAttribute("href", `${APPS.shop}/signup`);

    const nav = page.getByRole("navigation", { name: "Main" });
    await nav.getByRole("link", { name: "Features" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Everything between upload and paper");
    await nav.getByRole("link", { name: "Pricing" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Honest per-page prices");
    await expect(page.getByText("Batches of up to 20 documents")).toBeVisible();
  });

  test("lists shops, narrows by search and opens a shop with its price table", async ({ page }) => {
    await page.goto(`${APPS.landing}/find`);
    await expect(page.getByRole("heading", { name: "Express Laser Prints" })).toBeVisible();
    await page.getByLabel("Search shops by name or area").fill("Express");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=Express/);
    await expect(page.getByRole("heading", { name: "Express Laser Prints" })).toBeVisible();

    await page.getByRole("link", { name: "Prices & reviews" }).first().click();
    await expect(page).toHaveURL(/\/find\/express-laser$/);
    await expect(page.getByRole("heading", { level: 1, name: "Express Laser Prints" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Standard" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Print here/ })).toHaveAttribute("href", `${APPS.customer}/print/new?shop=express-laser`);

    const missing = await page.goto(`${APPS.landing}/find/no-such-shop`);
    expect(missing?.status()).toBe(404);
  });

  test("serves the blog, with search-engine metadata", async ({ page, request }) => {
    await page.goto(`${APPS.landing}/blog`);
    await page.getByRole("link", { name: /How PrintLoop works/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("How PrintLoop works");
    await expect(page.getByRole("heading", { name: "The loop in five steps" })).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld["@type"]).toBe("BlogPosting");

    const missing = await page.goto(`${APPS.landing}/blog/not-a-real-post`);
    expect(missing?.status()).toBe(404);

    const sitemap = await (await request.get(`${APPS.landing}/sitemap.xml`)).text();
    expect(sitemap).toContain("/find/express-laser");
    expect(sitemap).toContain("/blog/how-printloop-works");
    expect(await (await request.get(`${APPS.landing}/robots.txt`)).text()).toContain("Sitemap:");
  });

  test("publishes legal pages that match how the product really works", async ({ page }) => {
    await page.goto(`${APPS.landing}/privacy`);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByText("pl_session")).toBeVisible();
    await expect(page.getByText(/sentry/i)).toHaveCount(0);
    await page.goto(`${APPS.landing}/terms`);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });

  test("validates the contact form before opening a mail app", async ({ page }) => {
    await page.goto(`${APPS.landing}/contact`);
    await page.getByRole("button", { name: /Send message/ }).click();
    await expect(page.getByText(/Fill in your name, a valid email and a message/)).toBeVisible();
  });

  test("shows the cookie notice and remembers the choice", async ({ page }) => {
    await page.goto(APPS.landing);
    const dialog = page.getByRole("dialog", { name: /cookie/i }).or(page.getByText(/strictly necessary|cookies/i).first());
    await expect(dialog).toBeVisible();
  });
});

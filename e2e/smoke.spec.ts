import { expect, test } from "@playwright/test";

test.describe("pages load", () => {
  for (const locale of ["en", "sk"]) {
    test(`home loads in ${locale}`, async ({ page }) => {
      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    });
  }

  test("methodology loads", async ({ page }) => {
    const response = await page.goto("/en/methodology");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("dashboard", () => {
  test("state filter narrows the rows and clear restores them", async ({ page }) => {
    await page.goto("/en/dashboard");
    const showing = page.locator("[aria-live=polite]").filter({ hasText: /\d/ }).first();
    const before = await showing.innerText();

    const radio = page.locator("input[type=radio][name=state]:not([value=all]):not([disabled])").first();
    await radio.check({ force: true });
    await expect(showing).not.toHaveText(before);

    await page.getByRole("button", { name: /clear|reset/i }).first().click();
    await expect(showing).toHaveText(before);
  });

  test("search by ticker finds the company", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.getByRole("searchbox").fill("NVDA");
    await expect(page.getByRole("link", { name: /NVDA/ }).first()).toBeVisible();
  });
});

test.describe("company page", () => {
  test("fixture ticker renders", async ({ page }) => {
    const response = await page.goto("/en/company/NVDA");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("NVDA");
  });

  test("unknown ticker returns 404", async ({ page }) => {
    const response = await page.goto("/en/company/NOPE");
    expect(response?.status()).toBe(404);
  });
});

test.describe("chrome", () => {
  test("language switch keeps the path and sets the cookie", async ({ page, context }) => {
    await page.goto("/en/methodology");
    await page.locator("a.lang-switch").click();
    await expect(page).toHaveURL(/\/sk\/methodology$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "sk");
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.value === "sk")).toBe(true);
  });

  test("theme toggle flips data-theme and survives reload", async ({ page }) => {
    await page.goto("/en");
    const html = page.locator("html");
    await page.locator("button.theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.locator("button.theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("unknown locale returns 404", async ({ page }) => {
    const response = await page.goto("/xx/dashboard");
    expect(response?.status()).toBe(404);
  });
});

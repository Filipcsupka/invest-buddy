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

test.describe("public profiles", () => {
  test("fixture pages show labelled empty states and profile presets", async ({ page }) => {
    await page.goto("/en/dashboard");
    const lists = page.getByRole("region", { name: "Company profile" });
    await expect(lists.getByRole("region", { name: "Sustained growers" })).toContainText("Profiles not computed yet");
    await expect(lists.getByRole("region", { name: "Higher volatility, event-driven" })).toContainText("Profiles not computed yet");
    await page.goto("/en/company/NVDA");
    const profile = page.locator("[data-profile-block]");
    await expect(profile.getByRole("heading", { name: "Company profile" })).toBeVisible();
    await expect(profile).toContainText("Profiles not computed yet");
    await page.goto("/en/scanner");
    await expect(page.getByRole("link", { name: /Sustained growers/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Higher volatility, event-driven/ })).toBeVisible();
    await page.getByRole("link", { name: /Sustained growers/ }).click();
    await expect(page.getByRole("table").first()).toContainText("Profiles not computed yet");
  });

  test("profile empty state has an accessible heading in Slovak", async ({ page }) => {
    await page.goto("/sk/company/NVDA");
    const section = page.locator("[data-profile-block]");
    await expect(section).toHaveAttribute("aria-labelledby", "public-profile-title");
    await expect(section.locator("#public-profile-title")).toBeVisible();
    await expect(section).toContainText("Profily ešte nie sú vypočítané");
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

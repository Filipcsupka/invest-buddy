import { expect, test } from "@playwright/test";

for (const [locale, path, title, action] of [
  ["en", "nonexistent", "Page not found", "Open the stock screen"],
  ["sk", "neexistuje", "Stránka sa nenašla", "Otvoriť prehľad akcií"],
] as const) {
  test(`unknown ${locale} route renders localized 404`, async ({ request }) => {
    const response = await request.get(`/${locale}/${path}`);
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain("<strong>InvestBuddy</strong>");
    expect(html).toContain(title);
    expect(html).toContain(action);
  });
}

test("font and favicon responses have long-lived cache headers", async ({ request }) => {
  const font = await request.get("/fonts/inter-latin-wght-normal.woff2");
  expect(font.status()).toBe(200);
  expect(font.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  const favicon = await request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["cache-control"]).toBe("public, max-age=86400");
});

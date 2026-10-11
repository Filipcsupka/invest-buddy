import { expect, it } from "vitest";
import { statusPage } from "./status-page";

it.each([["en", "Too many requests", "Back to home"], ["sk", "Príliš veľa požiadaviek", "Späť na úvod"]] as const)("429 page (%s) has retry-after, id and way back", async (locale, title, action) => {
  const response = statusPage("rateLimited", 429, locale, "req-12345678", 30);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(response.headers.get("x-request-id")).toBe("req-12345678");
  const body = await response.text();
  expect(body).toContain(title);
  expect(body).toContain(action);
  expect(body).toContain("req-12345678");
});

it.each([["en", "Back shortly"], ["sk", "Čoskoro späť"]] as const)("503 page (%s)", async (locale, title) => {
  const response = statusPage("maintenance", 503, locale, "req-12345678");
  expect(response.status).toBe(503);
  expect(await response.text()).toContain(title);
});

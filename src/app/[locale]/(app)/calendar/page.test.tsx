import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/markets/gate", () => ({ assertViewable: async () => { if (!state.allowed) throw new Error("404"); } }));
vi.mock("@/data/calendar-view", () => ({ upcomingCalendar: async () => ({
  earnings: [
    { ticker: "NVDA", date: "2026-12-01", timeOfDay: "AfterMarket" },
    { ticker: "ASML", date: "2026-12-02", timeOfDay: "beforemarket" },
    { ticker: "SAP", date: "2026-12-03", timeOfDay: "unknown-vendor-value" },
  ],
  macro: [{ kind: "CPI", date: "2026-12-10", label: "CPI release" }],
}) }));
import CalendarPage from "./page";

it.each(["en", "sk"])("renders stored dates in %s without advice wording", async (locale) => {
  state.allowed = true;
  const html = renderToStaticMarkup(await CalendarPage({ params: Promise.resolve({ locale }) }));
  expect(html).toContain(`href="/${locale}/company/NVDA"`);
  expect(html).toContain("2026-12-01");
  expect(html).toContain("2026-12-10");
  expect(html).toContain(locale === "en" ? "After market close" : "Po zatvorení trhu");
  expect(html).toContain(locale === "en" ? "Before market open" : "Pred otvorením trhu");
  expect(html).toContain(locale === "en" ? "Time not stated" : "Čas nie je uvedený");
  expect(html).not.toContain("AfterMarket");
  expect(html).not.toContain("unknown-vendor-value");
  expect(html).not.toMatch(/\b(buy|sell|recommend)\b/i);
  state.allowed = false;
  await expect(CalendarPage({ params: Promise.resolve({ locale }) })).rejects.toThrow("404");
});

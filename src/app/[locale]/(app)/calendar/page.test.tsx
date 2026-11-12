import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/markets/gate", () => ({ assertViewable: async () => { if (!state.allowed) throw new Error("404"); } }));
vi.mock("@/data/calendar-view", () => ({ upcomingCalendar: async () => ({
  earnings: [{ ticker: "NVDA", date: "2026-12-01", timeOfDay: "post-market" }],
  macro: [{ kind: "CPI", date: "2026-12-10", label: "CPI release" }],
}) }));
import CalendarPage from "./page";

it.each(["en", "sk"])("renders stored dates in %s without advice wording", async (locale) => {
  state.allowed = true;
  const html = renderToStaticMarkup(await CalendarPage({ params: Promise.resolve({ locale }) }));
  expect(html).toContain(`href="/${locale}/company/NVDA"`);
  expect(html).toContain("2026-12-01");
  expect(html).toContain("2026-12-10");
  expect(html).not.toMatch(/\b(buy|sell|recommend)\b/i);
  state.allowed = false;
  await expect(CalendarPage({ params: Promise.resolve({ locale }) })).rejects.toThrow("404");
});

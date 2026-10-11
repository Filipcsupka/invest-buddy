import { describe, expect, it } from "vitest";
import { WEEKLY_TEXT, formatWeekly, isoWeek, isoWeekMonday, weeklyMovers, type WeeklyInput, type WeeklyRow } from "./weekly";

const row = (ticker: string, state: WeeklyRow["state"], points: number | null, previous: WeeklyRow["previous"] = null): WeeklyRow => ({ ticker, state, points, previous });
const rows: WeeklyRow[] = [
  row("NVDA", "Setup met (>=18)", 19, { state: "Watch", points: 16 }),
  row("AMD", "Watch", 16, { state: "Watch", points: 15 }),
  row("INTC", "Wait", 13, { state: "Watch", points: 15 }),
  row("MSFT", "Setup met (>=18)", 20, { state: "Setup met (>=18)", points: 20 }),
  row("NEW", "Watch", 17),
  row("GAP", "Insufficient/invalid data", null, { state: "Watch", points: 15 }),
];
const base: WeeklyInput = { rows, locale: "en", asOf: "2026-10-09", adviceOutput: false, site: "https://invest.test/" };

describe("formatWeekly", () => {
  it("renders the English summary", () => {
    const lines = formatWeekly(base).split("\n");
    expect(lines[0]).toBe("📊 <b>Weekly summary · week 2026-W41 (scores of 2026-10-09)</b>");
    expect(lines).toContain("🟢 Conditions met: 2");
    expect(lines).toContain("🔵 Watching: 2");
    expect(lines).toContain("🟡 Waiting: 1");
    expect(lines).toContain("🟠 Not now: 0");
    expect(lines).toContain("⚪ Not enough data: 1");
    expect(lines).toContain('<a href="https://invest.test/en/company/MSFT">MSFT</a> (20) · <a href="https://invest.test/en/company/NVDA">NVDA</a> (19)');
    expect(lines).toContain('<a href="https://invest.test/en/company/AMD">AMD</a> (16) · <a href="https://invest.test/en/company/NEW">NEW</a> (17)');
    expect(lines).toContain('<a href="https://invest.test/en/company/NVDA">NVDA</a> 🔵 → 🟢');
    expect(lines).toContain('<a href="https://invest.test/en/company/INTC">INTC</a> 🔵 → 🟡');
    expect(lines.at(-2)).toBe('<a href="https://invest.test/en/dashboard">Dashboard</a> · <a href="https://invest.test/en/methodology">Methodology</a>');
    expect(lines.at(-1)).toBe("Informational screening under the published methodology, not personal advice.");
  });

  it("renders Slovak with Slovak links and labels", () => {
    const text = formatWeekly({ ...base, locale: "sk" });
    expect(text).toContain("Týždenný prehľad · týždeň 2026-W41");
    expect(text).toContain("🟢 Podmienky splnené: 2");
    expect(text).toContain('href="https://invest.test/sk/company/NVDA"');
    expect(text).toContain('<a href="https://invest.test/sk/dashboard">Dashboard</a> · <a href="https://invest.test/sk/methodology">Metodika</a>');
    expect(text).toContain("nie osobné odporúčanie");
  });

  it("says Conditions met with ADVICE_OUTPUT off and Buy zone only with it on", () => {
    expect(formatWeekly(base)).not.toContain("Buy zone");
    expect(formatWeekly({ ...base, adviceOutput: true })).toContain("🟢 Buy zone: 2");
    expect(formatWeekly({ ...base, locale: "sk", adviceOutput: true })).toContain("Zóna nákupu");
    expect(formatWeekly({ ...base, locale: "sk" })).not.toContain("Zóna nákupu");
  });

  it("uses no buy or sell wording with the flag off, in both languages", () => {
    for (const locale of ["en", "sk"] as const) expect(formatWeekly({ ...base, locale })).not.toMatch(/\b(buy|sell|kúp|predaj|EUR)\b|—/i);
  });

  it("escapes tickers in text and in hrefs", () => {
    const text = formatWeekly({ ...base, rows: [row('A<B>&"', "Watch", 16, { state: "Wait", points: 13 })] });
    expect(text).toContain('<a href="https://invest.test/en/company/A%3CB%3E%26%22">A&lt;B&gt;&amp;&quot;</a> (16)');
    expect(text).not.toMatch(/<B>|A<B/);
  });

  it("shows no data, never 0, and counts a missing rating as not moved", () => {
    const text = formatWeekly({ ...base, rows: [row("XYZ", "Watch", null, { state: "Wait", points: 12 })] });
    expect(text).toContain("(no data)");
    expect(text).not.toContain("(0)");
    expect(weeklyMovers(rows)).toEqual({ up: [rows[0]], down: [rows[2]] });
  });

  it("handles no rows and empty lists", () => {
    expect(formatWeekly({ ...base, rows: [] })).toContain("No scores yet.");
    expect(formatWeekly({ ...base, rows: [row("AMD", "Wait", 13)] })).toContain("none");
  });

  it("keeps every line a complete HTML fragment so a split never cuts a tag", () => {
    const many = Array.from({ length: 40 }, (_, i) => row(`T${String(i).padStart(2, "0")}`, "Watch", 16));
    for (const line of formatWeekly({ ...base, rows: many }).split("\n")) expect((line.match(/<a /g) ?? []).length).toBe((line.match(/<\/a>/g) ?? []).length);
  });
});

describe("iso week", () => {
  it("labels weeks and keys them by Monday", () => {
    expect(isoWeek("2026-10-09")).toBe("2026-W41");
    expect(isoWeekMonday("2026-10-09")).toBe("2026-10-05");
    expect(isoWeekMonday("2026-10-11")).toBe("2026-10-05");
    expect(isoWeekMonday("2026-10-05")).toBe("2026-10-05");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeekMonday("2027-01-03")).toBe("2026-12-28");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });
});

describe("weekly text parity", () => {
  it("has the same keys in English and Slovak, all filled", () => {
    expect(Object.keys(WEEKLY_TEXT.sk).sort()).toEqual(Object.keys(WEEKLY_TEXT.en).sort());
    for (const locale of ["en", "sk"] as const) for (const [key, value] of Object.entries(WEEKLY_TEXT[locale])) {
      expect(typeof value === "function" ? value("2026-W41", "2026-10-09") : value, `${locale}.${key}`).toBeTruthy();
    }
  });
});

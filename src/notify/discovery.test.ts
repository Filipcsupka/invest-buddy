import { describe, expect, it } from "vitest";
import { DISCOVERY_TEXT, deliverNewCandidates, formatNewCandidates, loadWeekCandidates, tickerLink, type DiscoveryPostInput, type DiscoveryRow } from "./discovery";
import { MemoryDeliveryLog } from "../db/notifications";
import type { Notifier } from "./telegram";

const filing = "https://www.sec.gov/Archives/edgar/data/1/000000000026000001/0000000000-26-000001-index.htm";
const rows: DiscoveryRow[] = [
  { symbol: "WEAK", name: "Weak & Co <Ltd>", ruleScore: 12, ruleState: "Wait", sources: [{ kind: "price_volume", url: "https://www.nasdaq.com/market-activity/stocks/weak", detail: "Stored five-session price and volume move" }] },
  { symbol: "GRWT", name: "Growth Technologies Inc", ruleScore: 17, ruleState: "Watch", sources: [
    { kind: "frames", url: "https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2026Q2.json", detail: "SEC XBRL quarterly revenue growth and acceleration", growth: { current: 40, prior: 20.25 } },
    { kind: "edgar", url: filing, detail: "8-K Item 1.01" },
    { kind: "edgar", url: filing, detail: "8-K Item 1.01" },
  ] },
  { symbol: "TOP", name: "Top Inc", ruleScore: 19, ruleState: "Setup met (>=18)", sources: [{ kind: "theme", url: "https://investors.top.test/", detail: "Higher rack density → liquid cooling" }] },
];
const base: DiscoveryPostInput = { week: "2026-10-05", rows, locale: "en", adviceOutput: false, site: "https://invest.test/" };

describe("formatNewCandidates", () => {
  it("lists candidates best score first with links, growth, rule state and sources", () => {
    const lines = formatNewCandidates(base).split("\n");
    expect(lines[0]).toBe("🔎 <b>New candidates · week of 2026-10-05</b>");
    const symbols = lines.filter((l) => l.includes("<b>") && l.includes("</a>")).map((l) => /<b>([A-Z]+)<\/b>/.exec(l)![1]);
    expect(symbols).toEqual(["TOP", "GRWT", "WEAK"]);
    expect(lines).toContain(`<a href="${filing}"><b>GRWT</b></a> · Growth Technologies Inc`);
    expect(lines).toContain("Rule score: 17 / 25 · 🔵 Watching");
    expect(lines).toContain("Revenue growth 40.0% year over year (previous quarter 20.3%)");
    expect(lines).toContain(`• <a href="${filing}">SEC 8-K</a>: 8-K Item 1.01`);
    expect(lines.filter((l) => l.startsWith("• ") && l.includes("8-K Item 1.01"))).toHaveLength(1);
    expect(lines).toContain('• <a href="https://investors.top.test/">Theme</a>: Higher rack density → liquid cooling');
    expect(lines.at(-2)).toBe('<a href="https://invest.test/en/methodology">Methodology</a>');
    expect(lines.at(-1)).toBe("Informational screening under the published methodology, not personal advice.");
  });

  it("links a name without a filing to the SEC company search and escapes names and URLs", () => {
    const text = formatNewCandidates(base);
    expect(text).toContain('<a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&amp;CIK=WEAK&amp;type=&amp;dateb=&amp;owner=include&amp;count=40"><b>WEAK</b></a> · Weak &amp; Co &lt;Ltd&gt;');
    expect(tickerLink(rows[0])).toContain("CIK=WEAK");
    expect(tickerLink(rows[1])).toBe(filing);
    expect(text).not.toContain("<Ltd>");
  });

  it("renders Slovak labels and states", () => {
    const text = formatNewCandidates({ ...base, locale: "sk" });
    expect(text).toContain("Noví kandidáti · týždeň od 2026-10-05");
    expect(text).toContain("Skóre pravidiel: 17 / 25 · 🔵 Sledovanie");
    expect(text).toContain("Rast tržieb 40.0 % medziročne");
    expect(text).toContain('<a href="https://invest.test/sk/methodology">Metodika</a>');
    expect(text).toContain("nie osobné odporúčanie");
  });

  it("uses neutral wording while ADVICE_OUTPUT is off and the advice label only when it is on", () => {
    for (const locale of ["en", "sk"] as const) {
      const off = formatNewCandidates({ ...base, locale });
      expect(off).toContain(locale === "en" ? "Conditions met" : "Podmienky splnené");
      expect(off).not.toMatch(/\b(buy|sell|kúpiť|nakúpiť|predať)\b/i);
    }
    expect(formatNewCandidates({ ...base, adviceOutput: true })).toContain("Buy zone");
    expect(formatNewCandidates({ ...base, adviceOutput: true, locale: "sk" })).toContain("Zóna nákupu");
  });

  it("keeps an unknown stored state as plain text and handles an empty list", () => {
    expect(formatNewCandidates({ ...base, rows: [{ ...rows[0], ruleState: "Odd <state>" }] })).toContain("Odd &lt;state&gt;");
    expect(formatNewCandidates({ ...base, rows: [] })).toContain("No candidates this week.");
  });

  it("keeps ten candidates under the Telegram limit of visible characters, with every tag closed inside its own line", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...rows[1], symbol: `G${i}` }));
    const text = formatNewCandidates({ ...base, rows: ten });
    expect(text.replace(/<[^>]+>/g, "").length).toBeLessThan(4096);
    for (const line of text.split("\n")) expect((line.match(/<a /g) ?? []).length).toBe((line.match(/<\/a>/g) ?? []).length);
  });

  it("has the same text keys in English and Slovak", () => {
    expect(Object.keys(DISCOVERY_TEXT.sk).sort()).toEqual(Object.keys(DISCOVERY_TEXT.en).sort());
    expect(Object.keys(DISCOVERY_TEXT.sk.kinds).sort()).toEqual(Object.keys(DISCOVERY_TEXT.en.kinds).sort());
  });
});

describe("deliverNewCandidates", () => {
  const notifier = (fail = false) => { const sent: string[] = []; const n: Notifier = { send: async (text) => { if (fail) throw new Error("down"); sent.push(text); } }; return { n, sent }; };

  it("posts once per week and language, and a rerun posts nothing", async () => {
    const log = new MemoryDeliveryLog();
    const { n, sent } = notifier();
    const input = { ...base, notifier: n, log, target: "chat" };
    expect(await deliverNewCandidates(input)).toEqual({ sent: 1, duplicates: 0 });
    expect(await deliverNewCandidates(input)).toEqual({ sent: 0, duplicates: 1 });
    expect(sent).toHaveLength(1);
    expect([...log.keys]).toEqual(["telegram|chat|2026-10-05|discovery:en"]);
    expect(await deliverNewCandidates({ ...input, locale: "sk" })).toEqual({ sent: 1, duplicates: 0 });
    expect(await deliverNewCandidates({ ...input, week: "2026-10-12" })).toEqual({ sent: 1, duplicates: 0 });
  });

  it("releases the claim when the send fails so the next run retries", async () => {
    const log = new MemoryDeliveryLog();
    await expect(deliverNewCandidates({ ...base, notifier: notifier(true).n, log, target: "chat" })).rejects.toThrow("down");
    expect(log.keys.size).toBe(0);
    const { n, sent } = notifier();
    expect(await deliverNewCandidates({ ...base, notifier: n, log, target: "chat" })).toEqual({ sent: 1, duplicates: 0 });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing and claims nothing for an empty week", async () => {
    const log = new MemoryDeliveryLog();
    const { n, sent } = notifier();
    expect(await deliverNewCandidates({ ...base, rows: [], notifier: n, log, target: "chat" })).toEqual({ sent: 0, duplicates: 0 });
    expect(sent).toHaveLength(0);
    expect(log.keys.size).toBe(0);
  });
});

describe("loadWeekCandidates", () => {
  it("maps stored rows and skips rejected ones in SQL", async () => {
    const seen: string[] = [];
    const db = { query: async (sql: string, params: unknown[]) => {
      seen.push(`${sql.replace(/\s+/g, " ")}|${params[0]}`);
      return { rows: [{ symbol: "GRWT", name: "Growth Technologies Inc", rule_score: "17", rule_state: "Watch", sources: [{ kind: "edgar", url: filing, detail: "8-K Item 1.01" }] }] };
    } };
    const result = await loadWeekCandidates(db as never, "2026-10-05");
    expect(result).toEqual([{ symbol: "GRWT", name: "Growth Technologies Inc", ruleScore: 17, ruleState: "Watch", sources: [{ kind: "edgar", url: filing, detail: "8-K Item 1.01" }] }]);
    expect(seen[0]).toContain("status <> 'rejected'");
    expect(seen[0]).toMatch(/\|2026-10-05$/);
  });
});

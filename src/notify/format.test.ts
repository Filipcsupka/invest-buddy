import { describe, expect, it } from "vitest";
import { ALERT_TEXT, BAND_EMOJI, bandOf, escapeHtml, formatEventAlert, sliderLines, type EventAlertInput, type StateName } from "./format";

const base: EventAlertInput = {
  ticker: "NVDA", locale: "sk", adviceOutput: false, site: "https://invest.test/",
  previous: { state: "Watch", points: 16 }, current: { state: "Setup met (>=18)", points: 18 },
};

describe("formatEventAlert", () => {
  it("renders the full Slovak alert", () => {
    const text = formatEventAlert({ ...base, confirmations: ["revenue", "eps", "insider"], coverage: { known: 23, total: 25 } });
    expect(text.split("\n")).toEqual([
      "🟢 <b>NVDA</b> · Podmienky splnené",
      "🔴🟠🟡🔵🟢",
      "▫️▫️▫️▫️⬆️",
      "Bolo: 🔵 Sledovanie (16) → Teraz: 🟢 (18 / 25)",
      "Potvrdenia: ✓ Rast tržieb ✓ EPS ✓ Insideri (Form 4)",
      "Údaje: 23 z 25 bodov má overené zdroje",
      '<a href="https://invest.test/sk/company/NVDA">Otvoriť NVDA</a> · <a href="https://invest.test/sk/methodology">Metodika</a>',
      "Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.",
    ]);
  });

  it("renders English and links to the English pages", () => {
    const text = formatEventAlert({ ...base, locale: "en" });
    expect(text).toContain("🟢 <b>NVDA</b> · Conditions met");
    expect(text).toContain("Was: 🔵 Watching (16) → Now: 🟢 (18 / 25)");
    expect(text).toContain('href="https://invest.test/en/company/NVDA"');
    expect(text).toContain("Informational screening");
  });

  it("puts the marker under the active step for every band", () => {
    const positions: Record<string, string> = { red: "⬆️▫️▫️▫️▫️", orange: "▫️⬆️▫️▫️▫️", yellow: "▫️▫️⬆️▫️▫️", blue: "▫️▫️▫️⬆️▫️", green: "▫️▫️▫️▫️⬆️" };
    for (const [state, band] of [["Criteria broken", "red"], ["Ignore", "orange"], ["Wait", "yellow"], ["Watch", "blue"], ["Setup met (>=18)", "green"]] as const) {
      expect(bandOf(state)).toBe(band);
      expect(sliderLines(band)[1]).toBe(positions[band]);
    }
  });

  it("uses flag-aware wording for the green band", () => {
    expect(formatEventAlert({ ...base, locale: "en", adviceOutput: false })).not.toMatch(/buy/i);
    expect(formatEventAlert({ ...base, locale: "en", adviceOutput: false })).toContain("Conditions met");
    expect(formatEventAlert({ ...base, locale: "en", adviceOutput: true })).toContain("· Buy zone");
    expect(formatEventAlert({ ...base, adviceOutput: false })).not.toMatch(/nákup/i);
    expect(formatEventAlert({ ...base, adviceOutput: true })).toContain("· Zóna nákupu");
    // Other bands never change with the flag.
    const waiting = { ...base, previous: null, current: { state: "Wait", points: 13 } } as EventAlertInput;
    expect(formatEventAlert({ ...waiting, adviceOutput: true })).toBe(formatEventAlert({ ...waiting, adviceOutput: false }));
  });

  it("shows no data, never 0 points, when the state has no data", () => {
    for (const locale of ["en", "sk"] as const) {
      const text = formatEventAlert({ ...base, locale, previous: { state: "Watch", points: 16 }, current: { state: "Insufficient/invalid data", points: 0 } });
      expect(text).toContain(`⚪ (${ALERT_TEXT[locale].noData})`);
      expect(text).not.toMatch(/\(0\b/);
      expect(text).not.toContain("▫️");
      expect(text).not.toContain("/ 25");
    }
    const from = formatEventAlert({ ...base, previous: { state: "Insufficient/invalid data", points: 0 } });
    expect(from).toContain("Bolo: ⚪ Nedostatok údajov (bez údajov)");
    expect(formatEventAlert({ ...base, previous: { state: "Watch", points: null } })).toContain("🔵 Sledovanie (bez údajov)");
  });

  it("labels a first rating and leaves out unknown optional lines", () => {
    const text = formatEventAlert({ ...base, locale: "en", previous: null });
    expect(text).toContain("First rating: 🟢 (18 / 25)");
    expect(text).not.toMatch(/Confirmations|Data:|null|undefined/);
  });

  it("escapes HTML in tickers and urls", () => {
    const text = formatEventAlert({ ...base, ticker: 'A<b>&"X', site: 'https://s.test/?a=1&b="2"' });
    expect(text).toContain("<b>A&lt;b&gt;&amp;&quot;X</b>");
    expect(text).toContain("%3Cb%3E%26%22X");
    expect(text).toContain("a=1&amp;b=&quot;2&quot;");
    expect(escapeHtml("a & <b> \"q\"")).toBe("a &amp; &lt;b&gt; &quot;q&quot;");
  });

  it("stays under the Telegram limit and has no advice words with the flag off", () => {
    const states: StateName[] = ["Setup met (>=18)", "Watch", "Wait", "Ignore", "Criteria broken", "Insufficient/invalid data"];
    for (const locale of ["en", "sk"] as const) for (const state of states) {
      const text = formatEventAlert({ ...base, locale, current: { state, points: 12 }, confirmations: ["revenue", "eps", "guidance", "catalyst", "volume", "insider"], coverage: { known: 20, total: 25 } });
      expect(text.length).toBeLessThan(1000);
      expect(text).not.toMatch(/\b(buy|sell|kúp|predaj)\b|nákup|—/i);
    }
  });
});

describe("alert strings", () => {
  it("has the same keys in English and Slovak, with every band and chip filled", () => {
    expect(Object.keys(ALERT_TEXT.sk).sort()).toEqual(Object.keys(ALERT_TEXT.en).sort());
    for (const locale of ["en", "sk"] as const) {
      expect(Object.keys(ALERT_TEXT[locale].bands).sort()).toEqual(Object.keys(BAND_EMOJI).sort());
      expect(Object.keys(ALERT_TEXT[locale].chips).sort()).toEqual(["catalyst", "eps", "guidance", "insider", "revenue", "volume"]);
      for (const value of [...Object.values(ALERT_TEXT[locale].bands), ...Object.values(ALERT_TEXT[locale].chips)]) expect(value.trim()).not.toBe("");
    }
    expect(ALERT_TEXT.sk.bands.green).not.toBe(ALERT_TEXT.en.bands.green);
  });
});

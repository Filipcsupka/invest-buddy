import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { AlertState, ScoreResult } from "@/engine";
import { scoredUniverse } from "@/data/scored";
import { getMessages, type Locale } from "@/i18n";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { ScannerTable } from "./scanner-table";
import { ScreenTable } from "./screen-table";
import { StatusLegend, StatusSteps } from "./method";
import { statusLabel } from "./status-slider";
import { toRow, type ScreenRow } from "./view-model";

const labels: Record<Locale, Record<StateKey, string>> = {
  en: { broken: "Criteria broken", ignore: "Not now", wait: "Waiting", watch: "Watching", setup: "Conditions met", insufficient: "Not enough data" },
  sk: { broken: "Kritériá porušené", ignore: "Mimo výberu", wait: "Čakanie", watch: "Sledovanie", setup: "Podmienky splnené", insufficient: "Nedostatok údajov" },
};
const alert: Record<StateKey, AlertState> = { setup: "Setup met (>=18)", watch: "Watch", wait: "Wait", ignore: "Ignore", broken: "Criteria broken", insufficient: "Insufficient/invalid data" };
const position: Record<StateKey, number | null> = { broken: 0, ignore: 1, wait: 2, watch: 3, setup: 4, insufficient: null };
const originalAdvice = process.env.ADVICE_OUTPUT;
afterEach(() => { if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

async function row(locale: Locale, state: StateKey, total: number, unknown: string[] = [], ticker?: string): Promise<ScreenRow> {
  const universe = await scoredUniverse();
  const { instrument, result: base } = universe[0];
  const result: ScoreResult = { ...base, state: alert[state], total, ruleHits: base.ruleHits.map((hit) => (unknown.includes(hit.id) ? { ...hit, matched: false, unknown: true } : hit)) };
  return toRow(locale, { instrument: ticker ? { ...instrument, ticker, name: ticker } : instrument, result });
}

const table = (locale: Locale, rows: ScreenRow[]) => renderToStaticMarkup(<ScreenTable locale={locale} rows={rows} columns={["company", "score", "state"]} caption="caption" disclaimerId="d" />);

describe("status cell in rows", () => {
  for (const locale of ["en", "sk"] as const) {
    for (const state of stateOrder) {
      it(`shows ${state} as marker, icon and label in ${locale}`, async () => {
        const html = table(locale, [await row(locale, state, 16)]);
        expect(html).toContain(labels[locale][state]);
        expect(html).toContain(`data-state="${state}"`);
        expect(html).toContain("<svg");
        expect(html).toContain('role="img"');
        const active = position[state];
        expect(html.match(/data-active=""/g) ?? []).toHaveLength(active === null ? 0 : 1);
      });
    }
  }

  it("states the status, step and data in the aria label", async () => {
    expect(table("en", [await row("en", "watch", 16)])).toContain("Status Watching, step 4 of 5, 16 of 25 points, data for 25 of 25 points");
    expect(table("sk", [await row("sk", "setup", 19, ["catalyst"])])).toContain("Stav Podmienky splnené, stupeň 5 z 5, 19 z 25 bodov, údaje pre 23 z 25 bodov");
  });

  it("shows the coverage hint only for rows with rules without data", async () => {
    const some = table("en", [await row("en", "watch", 16, ["catalyst", "macro-data"])]);
    expect(some).toContain("20/25");
    expect(some).toContain('title="Catalyst (2), Macro data (3)"');
    const full = table("en", [await row("en", "watch", 16)]);
    expect(full).toContain("25/25");
    expect(full).not.toContain("title=\"Catalyst");
    expect(full).not.toMatch(/data-state="insufficient"/);
  });

  it("strikes the points of a broken row and leaves insufficient rows without a data cell", async () => {
    const broken = table("en", [await row("en", "broken", 20)]);
    expect(broken).toContain("(<s>20</s>)");
    expect(broken).toContain("Points not counted: 20");
    const none = table("en", [await row("en", "insufficient", 0)]);
    expect(none).not.toContain("/25<");
    expect(none).toContain("No score");
  });

  it("follows ADVICE_OUTPUT for the green label only", async () => {
    delete process.env.ADVICE_OUTPUT;
    expect(table("en", [await row("en", "setup", 20)])).toContain("Conditions met");
    process.env.ADVICE_OUTPUT = "on";
    const on = table("en", [await row("en", "setup", 20)]);
    expect(on).toContain("Buy zone");
    expect(on).not.toContain("Conditions met");
    expect(table("sk", [await row("sk", "setup", 20)])).toContain("Zóna nákupu");
    expect(table("en", [await row("en", "watch", 16)])).toContain("Watching");
  });
});

function scanner(locale: Locale, rows: ScreenRow[]) {
  const m = getMessages(locale);
  const advice = process.env.ADVICE_OUTPUT === "on";
  const text = {
    searchLabel: m.scanner.searchLabel, searchPlaceholder: m.scanner.searchPlaceholder, filterLabel: m.scanner.filterLabel, allStates: m.scanner.allStates, clear: m.scanner.clear,
    empty: m.scanner.empty, showing: m.scanner.showing, sortBy: m.table.sortBy, disclaimer: m.common.disclaimer, extension: m.common.extension, noScore: m.common.noScore, noRejection: m.table.noRejection,
    held: m.portfolio.held, heldNoSignal: m.portfolio.heldNoSignal,
    columns: { ticker: m.table.ticker, sector: m.table.sector, score: m.table.score, rules: m.table.rules, state: m.status.columns.status, data: m.status.columns.data, criteria: m.table.criteria, f: "F", t: "T", m: "M", fName: m.groups.fundamentals, tName: m.groups.technical, mName: m.groups.macro },
    states: Object.fromEntries(stateOrder.map((key) => [key, statusLabel(m, key, advice)])) as Record<StateKey, string>,
    board: { summaryLabel: m.dashboard.summaryLabel, lowerTitle: m.dashboard.lowerTitle, lowerBody: m.dashboard.lowerBody, showLower: m.dashboard.showLower, empty: m.dashboard.empty, stateNotes: m.dashboard.stateNotes },
  };
  return renderToStaticMarkup(<ScannerTable locale={locale} rows={rows} text={text} />);
}

describe("dashboard board", () => {
  it("keeps the groups setup, watch, broken, lower and sorts by points then data then ticker", async () => {
    const rows = [
      await row("en", "ignore", 5, [], "LOW"),
      await row("en", "watch", 16, ["catalyst"], "WB"),
      await row("en", "setup", 18, [], "SB"),
      await row("en", "setup", 21, [], "SA"),
      await row("en", "watch", 16, [], "WA"),
      await row("en", "broken", 12, [], "BR"),
      await row("en", "insufficient", 0, [], "NEW"),
    ];
    const html = scanner("en", rows);
    const at = (needle: string) => html.indexOf(needle);
    expect(at('id="state-setup"')).toBeGreaterThan(-1);
    expect(at('id="state-setup"')).toBeLessThan(at('id="state-watch"'));
    expect(at('id="state-watch"')).toBeLessThan(at('id="state-broken"'));
    expect(at('id="state-broken"')).toBeLessThan(at('id="lower"'));
    // setup: higher points first; watch: equal points, more data first.
    expect(at(">SA<")).toBeLessThan(at(">SB<"));
    expect(at(">SB<")).toBeLessThan(at(">WA<"));
    expect(at(">WA<")).toBeLessThan(at(">WB<"));
    expect(at(">WB<")).toBeLessThan(at(">BR<"));
    expect(at(">BR<")).toBeLessThan(at(">LOW<"));
    expect(at(">LOW<")).toBeLessThan(at(">NEW<"));
    expect(html).toContain("<th scope=\"col\" class=\"col-data\">Data</th>");
    expect(html).toContain("Not enough data");
    expect(html).toContain("(<s>12</s>)");
  });

  it("renders the board in Slovak with the flag on and off", async () => {
    delete process.env.ADVICE_OUTPUT;
    const off = scanner("sk", [await row("sk", "setup", 20, [], "SA")]);
    expect(off).toContain("Podmienky splnené");
    expect(off).toContain("Údaje");
    expect(off).not.toContain("Zóna nákupu");
    process.env.ADVICE_OUTPUT = "on";
    const on = scanner("sk", [await row("sk", "setup", 20, [], "SA")]);
    expect(on).toContain("Zóna nákupu");
    expect(on).not.toContain("Podmienky splnené");
  });
});

describe("methodology legend", () => {
  for (const locale of ["en", "sk"] as const) {
    it(`lists five steps plus gray with ranges, coverage and chips in ${locale}`, () => {
      const m = getMessages(locale);
      const html = renderToStaticMarkup(<StatusLegend locale={locale} adviceOutput={false} />);
      for (const state of stateOrder) {
        expect(html).toContain(labels[locale][state]);
        expect(html).toContain(m.status.ranges[state]);
        expect(html).toContain(m.status.meaning[state]);
      }
      expect(html.match(/<tr data-state=/g)).toHaveLength(6);
      expect(html).toContain(m.status.legendMissing);
      expect(html).toContain(m.status.legendConfirm);
      expect(html).toContain('href="#rejection"');
      expect(html).not.toContain(m.status.advice.setup);
    });
  }

  it("uses the advice label only with the flag on", () => {
    const off = renderToStaticMarkup(<StatusLegend locale="en" adviceOutput={false} />);
    const on = renderToStaticMarkup(<StatusLegend locale="en" adviceOutput />);
    expect(off).toContain("Conditions met");
    expect(on).toContain("Buy zone");
    expect(on).not.toContain("Conditions met");
    expect(renderToStaticMarkup(<StatusSteps locale="sk" adviceOutput />)).toContain("Zóna nákupu");
  });
});

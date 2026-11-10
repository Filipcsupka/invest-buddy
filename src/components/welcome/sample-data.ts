import { score, type ScoreResult } from "@/engine";
import { displayScore } from "@/engine/display-score";
import { fixtureBars, fixtureFundamentals, fixtureMacro } from "@/data/fixtures";
import { stateKey } from "@/i18n/score-text";
import type { StateKey } from "@/i18n/rules";

/**
 * The public sample universe for the Welcome page and the pricing previews.
 *
 * Every company here is invented. Synthetic figures never sit under a real company name (funnel-design s0): the inputs come from the
 * fixture generators, keyed by an internal seed that is never shown, and the real scoring engine turns them into a score. Nothing in
 * this module reads the database, the network or a vendor feed, so the result is the same for every visitor and at build time.
 */
export interface SampleCompany {
  /** Invented ticker shown on the page. A clash with a listed ticker would be chance; every row carries a SAMPLE mark. */
  ticker: string;
  name: string;
  sector: "chips" | "software" | "networks" | "payments" | "biotech" | "energy" | "robotics";
  /** Internal seed for the fixture generators. Never rendered. */
  seed: string;
}

export const SAMPLE_COMPANIES: readonly SampleCompany[] = [
  { ticker: "NWND", name: "Northwind Semiconductors", sector: "chips", seed: "QRV" },
  { ticker: "HBLS", name: "Harbor Lane Software", sector: "software", seed: "BRVO" },
  { ticker: "ALPK", name: "Alder Peak Networks", sector: "networks", seed: "GRNT" },
  { ticker: "BLFP", name: "Bluefin Payments", sector: "payments", seed: "KESL" },
  { ticker: "CDRB", name: "Cedar Row Biotech", sector: "biotech", seed: "FENX" },
  { ticker: "SLTM", name: "Saltmarsh Energy", sector: "energy", seed: "VRDN" },
  { ticker: "TDWR", name: "Tidewater Robotics", sector: "robotics", seed: "NWS" },
];

export interface SampleRow {
  company: SampleCompany;
  result: ScoreResult;
  state: StateKey;
  percent: number | null;
  coreKnown: number;
  coreTotal: number;
}

let cache: SampleRow[] | null = null;

/** Score the sample universe once per process, ranked by display state then percent. Pure and synchronous. */
export function sampleRows(): SampleRow[] {
  if (cache) return cache;
  const rank: Record<StateKey, number> = { setup: 0, watch: 1, wait: 2, ignore: 3, broken: 4, insufficient: 5 };
  cache = SAMPLE_COMPANIES.map((company) => {
    const result = score({ ticker: company.ticker, bars: fixtureBars(company.seed), fundamentals: fixtureFundamentals(company.seed), macro: fixtureMacro(company.seed) });
    const display = displayScore(stateKey(result.state), result.ruleHits);
    return { company, result, state: display.state, percent: display.percent, coreKnown: display.coreKnown, coreTotal: display.coreTotal };
  }).sort((a, b) => rank[a.state] - rank[b.state] || (b.percent ?? -1) - (a.percent ?? -1) || a.company.ticker.localeCompare(b.company.ticker));
  return cache;
}

/** Length of the sample score history used to illustrate the depth note. A SAMPLE figure, not a count of real rows. */
export const SAMPLE_HISTORY_DAYS = 400;

/** The ticker whose score the Welcome story assembles rule by rule. Chosen because it shows both hits and misses. */
export const SPECIMEN_TICKER = "HBLS";

export function specimenRow(): SampleRow {
  const rows = sampleRows();
  return rows.find((row) => row.company.ticker === SPECIMEN_TICKER) ?? rows[0]!;
}

const histories = new Map<string, (number | null)[]>();

/**
 * Display score of one sample company over its last `sessions` trading days, from the same engine run on the generated bars cut at each
 * day. The fundamentals and macro inputs of the sample are fixed, so only the technical rules move. SAMPLE data, like the rest.
 */
export function sampleHistory(row: SampleRow, sessions = 20): (number | null)[] {
  const key = `${row.company.ticker}:${sessions}`;
  const hit = histories.get(key);
  if (hit) return hit;
  const bars = fixtureBars(row.company.seed);
  const out = Array.from({ length: sessions }, (_, i) => {
    const cut = bars.slice(0, bars.length - (sessions - 1 - i));
    const result = score({ ticker: row.company.ticker, bars: cut, fundamentals: fixtureFundamentals(row.company.seed), macro: fixtureMacro(row.company.seed) });
    return displayScore(stateKey(result.state), result.ruleHits).percent;
  });
  histories.set(key, out);
  return out;
}

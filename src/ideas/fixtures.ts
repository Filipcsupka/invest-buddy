import type { StoredIdea } from "../db/ideas";
import type { Baseline } from "../db/portfolio-baseline";

/**
 * Synthetic portfolio baseline for tests and the local demo. It is not production data and does not describe a real account.
 * The real baseline is entered with POST /api/ingest/portfolio-baseline.
 */
export const sampleBaseline: Baseline = {
  asOf: "2026-10-05",
  source: "manual",
  currency: "EUR",
  cashEur: 600,
  monthlyContributionEur: 200,
  positions: [
    { symbol: "NVDA", quantity: 4, valueEur: 540, costEur: 480 },
    { symbol: "MSFT", quantity: 1, valueEur: 390, costEur: 380 },
    { symbol: "CSPX", quantity: 3, valueEur: 2100, costEur: 1900 },
  ],
};

/** Illustrative ideas, shown only in fixture mode and used by the page tests. The numbers and links are made up. */
export const sampleIdeas: StoredIdea[] = [
  {
    id: 2, asOf: "2026-10-05", symbol: "NVDA", action: "ADD", amountMinEur: 60, amountMaxEur: 90,
    verdict: "Fundamentals hold and the price sits in the dip zone of an intact uptrend.",
    whatHappened: ["Sample: the price closed 7.4% under its 20-day high.", "Sample: the earnings release states revenue growth above the prior quarter."],
    whyItMatters: ["The dip qualifier of the rules is met while no rejection rule applies."],
    setup: { company: "Very strong", entry: "Strong", catalyst: "Good" },
    numbers: [{ label: "Score", value: "19 of 25" }, { label: "Below 20-day high", value: "7.4%" }, { label: "Revenue growth", value: "accelerating" }],
    plan: { amountNow: "EUR 60-90", trigger: "A fresh verified catalyst would upgrade this to HIGH_CONVICTION_ADD.", invalidation: "A guidance cut or a close under the 200-day average.", opportunityCost: "Against CSPX: the setup is stronger. Against MSFT: similar quality, better entry. Cash left: EUR 510." },
    evidence: [{ url: "https://example.com/nvda-release", label: "Sample earnings release" }, { url: "https://example.com/nvda-10q", label: "Sample 10-Q" }],
    unconfirmed: false, carriedFrom: null, conflictNote: null, downgradedFrom: null, signature: "ADD|Very strong|Strong|Good|60-90", ruleConfigVersion: "sample", model: "sample", createdAt: "2026-10-05T18:00:00.000Z",
  },
  {
    id: 1, asOf: "2026-10-04", symbol: "AMD", action: "WATCH", amountMinEur: 0, amountMaxEur: 0,
    verdict: "Evidence is thin: the catalyst field is carried from an older scan.",
    whatHappened: ["Sample: the last scan of this name is 12 days old.", "Sample: the price holds above both moving averages."],
    whyItMatters: ["Without a fresh verified catalyst the rules cannot support a buy."],
    setup: { company: "Good", entry: "Good", catalyst: "Neutral" },
    numbers: [{ label: "Score", value: "15 of 25" }, { label: "Carried field", value: "productCatalyst" }, { label: "Scan age", value: "12 days" }],
    plan: { amountNow: "EUR 0", trigger: "A verified catalyst dated in the last 30 days.", invalidation: "Revenue decline or a guidance cut.", opportunityCost: "Cash and CSPX stay the default until the evidence is fresh." },
    evidence: [],
    unconfirmed: true, carriedFrom: "2026-09-23", conflictNote: "Sample: the quoted release is dated before the rule window.", downgradedFrom: "START_POSITION", signature: "START_POSITION|Good|Good|Neutral|30-60", ruleConfigVersion: "sample", model: "sample", createdAt: "2026-10-04T18:00:00.000Z",
  },
];

import type { Technicals } from "../data/technicals";

/**
 * Deterministic trade signals. Code decides the action, the size tier and the three ratings; the AI judge only explains them.
 * Pure: the same input gives the same output, whatever the order of the symbols. No clock, no randomness, no I/O.
 * Profit and loss on a position is never an input, so a falling price below cost cannot produce an add.
 *
 * The action comes from data alone: the rule score, the three ratings and confirmed evidence. The owner's portfolio never decides
 * a buy action or a size tier, so the same symbol gives the same buy signal with or without a baseline. "Held" is optional context
 * and may only relabel a non-buy outcome (HOLD, REDUCE or THESIS_BROKEN instead of WATCH).
 *
 * Rules, in order, for each symbol (thresholds live in SIGNAL_RULES):
 *  1. Rejection (revenue declining, guidance cut, or the rule engine's "Criteria broken"): THESIS_BROKEN for a held name, WATCH otherwise.
 *  2. Held, company rating Weak and a downtrend: REDUCE. A name that is not held goes on and ends as WATCH.
 *  3. Fewer than two confirmed key fields: WATCH, insufficient evidence.
 *  4. ADD conditions: rule score at least 15, company and entry at least Good, no downtrend. START_POSITION needs 18. Not met: HOLD for a held name, WATCH otherwise.
 *  5. Conviction (score 18 or more, company, entry and catalyst at least Strong, a fresh confirmed EPS beat or guidance raise, no carried data):
 *       HIGH_CONVICTION_ADD, tier ADD_HALF (add about 1/2 of a full position).
 *     Good entry (entry at least Strong, or a pullback): ADD, tier ADD_THIRD (add about 1/3 of a full position).
 *     Otherwise START_POSITION with a tier by strength: FULL, STANDARD (about 2/3) or STARTER (about 1/3). Unconfirmed data caps it at STARTER.
 *  6. Owner amounts, for the private view only: with a portfolio baseline each tier maps to a share of available cash, capped by the
 *     position limit and the deploy limit. A band under the minimum becomes EUR 0. Amounts never change the action or the tier.
 *     Without a baseline they are 0.
 * CSPX_ALLOCATION is no longer produced. It depended on the owner's idle cash, so it belongs to the private owner view (task G4).
 * The value stays in ACTIONS so older stored ideas still parse.
 */
export const SIGNAL_RULES = {
  version: "2026-10-10.1",
  actionsOrder: ["HIGH_CONVICTION_ADD", "ADD", "START_POSITION"],
  /** InvestingGuide s6 and s8: START_POSITION needs 18; a score of 15 to 17 can qualify for ADD. */
  minScoreForBuy: 18,
  /** Guide section 8: an ADD alert needs score 15 or more; a BUY (START_POSITION) alert needs 18. */
  minScoreForAdd: 15,
  convictionScore: 18,
  minConfirmedKeyFields: 2,
  keyFields: ["revenueAccelerating", "revenueDeclining", "epsBeat", "guidanceRaised", "guidanceCut", "productCatalyst"],
  companyPoints: {
    revenueAccelerating: { true: 2 }, revenueDeclining: { true: -4, false: 1 }, epsBeat: { true: 1 }, guidanceRaised: { true: 1 },
    guidanceCut: { true: -4 }, narrativeChanged: { true: -2 }, insiderOrInstitutionalBuying: { true: 1 },
  } as Record<string, { true?: number; false?: number }>,
  /** A rating from points: the first threshold met, else Weak. */
  companyThresholds: { "Very strong": 5, Strong: 3, Good: 2, Neutral: 0 },
  catalystPoints: { productCatalyst: 3, productCatalystCarried: 1, epsBeat: 1, guidanceRaised: 1, insiderOrInstitutionalBuying: 1, narrativeChangedTrue: -2 },
  catalystThresholds: { "Very strong": 4, Strong: 3, Good: 2, Neutral: 0 },
  entryPoints: { pullback: 3, breakout: 3, uptrend: 2, deepPullback: 1, range: 0, downtrend: -3, rsiHealthyMin: 40, rsiHealthyMax: 60, rsiHealthy: 1, rsiExtended: 75, rsiExtendedPenalty: -2, rsiOversold: 30, rsiOversoldPenalty: -1, extendedAboveMa50Percent: 15, extendedPenalty: -2, relativeStrength20: 1, relativeStrength60: 1, breakoutBelowHighPercent: 1, breakoutVolumeRatio: 1.2 },
  entryThresholds: { "Very strong": 5, Strong: 3, Good: 1, Neutral: 0 },
  /**
   * START_POSITION tier by strength (placeholders, see docs/sizing-guide.md). FULL: score, company and catalyst at these levels with a fresh
   * confirmed EPS beat or guidance raise, whatever the entry. STANDARD: score and company at these levels. Anything else is STARTER.
   */
  startTiers: { full: { minScore: 18, company: "Very strong", catalyst: "Strong" }, standard: { minScore: 18, company: "Strong" } },
  /** Owner view only: shares of available cash per tier, [min, max], in percent. */
  ownerBands: { STARTER: [5, 10], STANDARD: [10, 20], FULL: [15, 30], ADD_THIRD: [8, 15], ADD_HALF: [15, 30] } as Record<string, [number, number]>,
  reducePercentOfPosition: [25, 50] as [number, number],
  minBuyEur: 20,
  maxPositionPercentOfInvested: 25,
  maxDeployPercentOfCash: 60,
} as const;
export type SignalRules = typeof SIGNAL_RULES;

export const ACTIONS = ["WATCH", "START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "HOLD", "REDUCE", "THESIS_BROKEN", "CSPX_ALLOCATION"] as const;
export type SignalAction = (typeof ACTIONS)[number];
export type SignalRating = "Very strong" | "Strong" | "Good" | "Neutral" | "Weak";

/** Size as a share of a full position in the reader's own portfolio, never a currency amount. NONE: no new money. */
export const SIZE_TIERS = ["NONE", "STARTER", "STANDARD", "FULL", "ADD_THIRD", "ADD_HALF"] as const;
export type SizeTier = (typeof SIZE_TIERS)[number];
/** Share of a full position each tier stands for. ADD tiers come on top of an existing position. */
export const TIER_FRACTION: Record<SizeTier, string> = { NONE: "0", STARTER: "1/3", STANDARD: "2/3", FULL: "1", ADD_THIRD: "1/3", ADD_HALF: "1/2" };
/** The tiers each action may carry. Every action that is not a buy carries NONE. */
export const TIERS_FOR_ACTION: Record<SignalAction, readonly SizeTier[]> = {
  START_POSITION: ["STARTER", "STANDARD", "FULL"], ADD: ["ADD_THIRD"], HIGH_CONVICTION_ADD: ["ADD_HALF"],
  WATCH: ["NONE"], HOLD: ["NONE"], REDUCE: ["NONE"], THESIS_BROKEN: ["NONE"], CSPX_ALLOCATION: ["NONE"],
};
export const tierFits = (action: SignalAction, tier: SizeTier) => TIERS_FOR_ACTION[action].includes(tier);

const ORDER: SignalRating[] = ["Weak", "Neutral", "Good", "Strong", "Very strong"];
const atLeast = (r: SignalRating, min: SignalRating) => ORDER.indexOf(r) >= ORDER.indexOf(min);

export interface SignalField { value: boolean | null; agreement: string; verified: boolean; carriedFrom: string | null }
export interface SignalSymbolInput {
  symbol: string;
  /** Optional context from the owner's baseline. Only relabels a non-buy outcome; never changes a buy action or tier. */
  held: { valueEur: number } | null;
  score: { total: number; state: string };
  fields: Record<string, SignalField>;
  expiredFields: string[];
  technicals: Technicals | null;
}
export interface SignalPortfolio { cashEur: number; investedEur: number; positions: { symbol: string; valueEur: number }[]; monthlyContributionEur?: number | null }
export interface Signal {
  symbol: string;
  action: SignalAction;
  sizeTier: SizeTier;
  /** Owner view only: EUR band from the private baseline, 0 without one. Never part of the public signal. */
  amountMinEur: number;
  amountMaxEur: number;
  ratings: { company: SignalRating; entry: SignalRating; catalyst: SignalRating };
  points: { company: number; entry: number; catalyst: number };
  unconfirmed: boolean;
  carriedFrom: string | null;
  confirmedFields: string[];
  /** Why the data gave this action and tier. Sent to the judge. */
  reasons: string[];
  /** Why the owner band was capped or zeroed. Private; not sent to the judge. */
  ownerNotes: string[];
  ruleConfigVersion: string;
}

const rate = (points: number, thresholds: Record<string, number>): SignalRating => {
  for (const name of ["Very strong", "Strong", "Good", "Neutral"] as const) if (points >= thresholds[name]) return name;
  return "Weak";
};
const cap = (r: SignalRating, max: SignalRating): SignalRating => (atLeast(r, max) ? max : r);

/** A field counts only when two agents agreed or SEC data confirmed it, the quote was verified, and it has not expired. Returns its value, or null when it does not count. */
export function confirmed(input: SignalSymbolInput, name: string): boolean | null {
  const f = input.fields[name];
  if (!f || f.value === null || !f.verified || !(f.agreement === "agree" || f.agreement === "xbrl_override") || input.expiredFields.includes(name)) return null;
  return f.value;
}

export function ratings(input: SignalSymbolInput, rules: SignalRules = SIGNAL_RULES) {
  const carried = (name: string) => Boolean(input.fields[name]?.carriedFrom);
  let company = 0, catalyst = 0, carriedPositive = false;
  for (const [name, table] of Object.entries(rules.companyPoints)) {
    const v = confirmed(input, name);
    if (v === null) continue;
    const p = table[v ? "true" : "false"] ?? 0;
    company += p;
    if (p > 0 && carried(name)) carriedPositive = true;
  }
  const cp = rules.catalystPoints;
  if (confirmed(input, "productCatalyst") === true) catalyst += carried("productCatalyst") ? cp.productCatalystCarried : cp.productCatalyst;
  for (const name of ["epsBeat", "guidanceRaised", "insiderOrInstitutionalBuying"] as const) if (confirmed(input, name) === true && !carried(name)) catalyst += cp[name];
  if (confirmed(input, "narrativeChanged") === true) catalyst += cp.narrativeChangedTrue;
  let companyRating = rate(company, rules.companyThresholds);
  if (carriedPositive) companyRating = cap(companyRating, "Good");

  let entry = 0;
  const t = input.technicals, e = rules.entryPoints;
  if (t) {
    const breakout = t.regime === "uptrend" && t.belowHigh20Percent !== null && t.belowHigh20Percent <= e.breakoutBelowHighPercent && (t.volumeRatio ?? 0) >= e.breakoutVolumeRatio;
    entry += t.regime === "pullback" ? e.pullback : breakout ? e.breakout : t.regime === "uptrend" ? e.uptrend : t.regime === "deep_pullback" ? e.deepPullback : t.regime === "downtrend" ? e.downtrend : e.range;
    if (t.rsi14 !== null) entry += t.rsi14 > e.rsiExtended ? e.rsiExtendedPenalty : t.rsi14 < e.rsiOversold ? e.rsiOversoldPenalty : t.rsi14 >= e.rsiHealthyMin && t.rsi14 <= e.rsiHealthyMax ? e.rsiHealthy : 0;
    if (t.vsMa50Percent !== null && t.vsMa50Percent > e.extendedAboveMa50Percent) entry += e.extendedPenalty;
    if (t.relativeStrength20 !== null && t.relativeStrength20 > 0) entry += e.relativeStrength20;
    if (t.relativeStrength60 !== null && t.relativeStrength60 > 0) entry += e.relativeStrength60;
  }
  return {
    ratings: { company: companyRating, entry: t ? rate(entry, rules.entryThresholds) : ("Neutral" as SignalRating), catalyst: rate(catalyst, rules.catalystThresholds) },
    points: { company, entry, catalyst },
  };
}

/** The data-only part: action, tier, ratings and reasons for one symbol. No portfolio input. */
export function signalFor(s: SignalSymbolInput, rules: SignalRules = SIGNAL_RULES): Signal {
  const r = ratings(s, rules);
  const keyConfirmed = rules.keyFields.filter((k) => confirmed(s, k) !== null);
  const carriedDates = Object.values(s.fields).map((f) => f.carriedFrom).filter((d): d is string => !!d).sort();
  const sig: Signal = {
    symbol: s.symbol, action: "WATCH", sizeTier: "NONE", amountMinEur: 0, amountMaxEur: 0, ratings: r.ratings, points: r.points,
    unconfirmed: keyConfirmed.length < rules.minConfirmedKeyFields || rules.keyFields.some((k) => confirmed(s, k) !== null && s.fields[k]?.carriedFrom),
    carriedFrom: carriedDates[0] ?? null, confirmedFields: keyConfirmed, reasons: [], ownerNotes: [], ruleConfigVersion: rules.version,
  };
  const regime = s.technicals?.regime ?? null;
  const rejected = confirmed(s, "revenueDeclining") === true || confirmed(s, "guidanceCut") === true || s.score.state === "Criteria broken";
  if (rejected) {
    sig.reasons.push("A rejection rule applies: revenue declining, guidance cut or criteria broken.");
    if (s.held) sig.action = "THESIS_BROKEN";
    return sig;
  }
  if (s.held && r.ratings.company === "Weak" && regime === "downtrend") {
    sig.action = "REDUCE";
    sig.reasons.push("Company rating is Weak and the price is in a downtrend.");
    return sig;
  }
  if (keyConfirmed.length < rules.minConfirmedKeyFields) { sig.reasons.push(`Insufficient evidence: ${keyConfirmed.length} confirmed key fields, ${rules.minConfirmedKeyFields} needed.`); return sig; }
  const setupOk = atLeast(r.ratings.company, "Good") && atLeast(r.ratings.entry, "Good") && regime !== "downtrend";
  if (!setupOk || s.score.total < rules.minScoreForAdd) {
    sig.reasons.push(setupOk
      ? `Score ${s.score.total} is below the add threshold of ${rules.minScoreForAdd}.`
      : "Buy conditions are not met.");
    if (s.held) sig.action = "HOLD";
    return sig;
  }
  const execution = confirmed(s, "epsBeat") === true || confirmed(s, "guidanceRaised") === true;
  const conviction = s.score.total >= rules.convictionScore && atLeast(r.ratings.company, "Strong") && atLeast(r.ratings.entry, "Strong") && atLeast(r.ratings.catalyst, "Strong") && execution && !sig.carriedFrom;
  if (conviction) { sig.action = "HIGH_CONVICTION_ADD"; sig.sizeTier = "ADD_HALF"; sig.reasons.push("Conviction conditions met."); return sig; }
  if (atLeast(r.ratings.entry, "Strong") || regime === "pullback") { sig.action = "ADD"; sig.sizeTier = "ADD_THIRD"; sig.reasons.push("Fundamentals hold and the entry is good."); return sig; }
  if (s.score.total < rules.minScoreForBuy) {
    sig.reasons.push(`Score ${s.score.total} is below the start threshold of ${rules.minScoreForBuy}; an add needs a strong entry or pullback.`);
    if (s.held) sig.action = "HOLD";
    return sig;
  }
  sig.action = "START_POSITION";
  const { full, standard } = rules.startTiers;
  if (sig.unconfirmed) { sig.sizeTier = "STARTER"; sig.reasons.push("Buy conditions met; unconfirmed or carried data keeps it to a starter."); }
  else if (s.score.total >= full.minScore && atLeast(r.ratings.company, full.company) && atLeast(r.ratings.catalyst, full.catalyst) && execution) { sig.sizeTier = "FULL"; sig.reasons.push("Buy conditions met with very strong fundamentals and fresh execution."); }
  else if (s.score.total >= standard.minScore && atLeast(r.ratings.company, standard.company)) { sig.sizeTier = "STANDARD"; sig.reasons.push("Buy conditions met with strong fundamentals."); }
  else { sig.sizeTier = "STARTER"; sig.reasons.push("Buy conditions met; starter position."); }
  return sig;
}

const band = (cash: number, [lo, hi]: [number, number]) => [Math.round((cash * lo) / 100), Math.round((cash * hi) / 100)] as [number, number];
const rank = (s: Signal) => SIGNAL_RULES.actionsOrder.indexOf(s.action as never);

/**
 * Owner view only. Fills amountMinEur/amountMaxEur from the private baseline. Changes nothing else: the action and tier stay as the data gave them.
 * Buys get a share of cash per tier, best signals first, capped by the position limit and the deploy limit; a band under the minimum is EUR 0.
 */
function ownerAmounts(signals: Signal[], inputs: Map<string, SignalSymbolInput>, portfolio: SignalPortfolio, rules: SignalRules) {
  const cash = portfolio.cashEur, invested = portfolio.investedEur;
  for (const sig of signals) {
    const held = inputs.get(sig.symbol)?.held?.valueEur ?? 0;
    if (sig.action === "REDUCE" && held > 0) {
      const [lo, hi] = rules.reducePercentOfPosition;
      sig.amountMinEur = Math.round((held * lo) / 100); sig.amountMaxEur = Math.round((held * hi) / 100);
    }
  }
  let deployed = 0;
  const deployCap = (cash * rules.maxDeployPercentOfCash) / 100;
  const buys = signals.filter((s) => rules.ownerBands[s.sizeTier]);
  buys.sort((a, b) => rank(a) - rank(b) || (inputs.get(b.symbol)?.score.total ?? 0) - (inputs.get(a.symbol)?.score.total ?? 0) || a.symbol.localeCompare(b.symbol));
  for (const sig of buys) {
    const held = inputs.get(sig.symbol)?.held?.valueEur ?? 0;
    let [lo, hi] = band(cash, rules.ownerBands[sig.sizeTier]);
    if (held > 0 && invested > 0) {
      const share = rules.maxPositionPercentOfInvested / 100;
      const room = Math.floor((share * invested - held) / (1 - share));
      if (room < hi) { hi = Math.max(room, 0); lo = Math.min(lo, hi); sig.ownerNotes.push(`Position limit of ${rules.maxPositionPercentOfInvested} percent of invested capital.`); }
    }
    if (deployed + hi > deployCap) { hi = Math.max(Math.floor(deployCap - deployed), 0); lo = Math.min(lo, hi); sig.ownerNotes.push(`Deploy limit of ${rules.maxDeployPercentOfCash} percent of cash.`); }
    if (hi < rules.minBuyEur) { sig.ownerNotes.push(`Band under the EUR ${rules.minBuyEur} minimum.`); continue; }
    sig.amountMinEur = Math.max(lo, rules.minBuyEur); sig.amountMaxEur = hi; deployed += hi;
  }
}

/** One signal per symbol, sorted by symbol. The portfolio only fills the private owner amounts; it never changes an action or a tier. */
export function computeSignals(symbols: SignalSymbolInput[], portfolio: SignalPortfolio | null, rules: SignalRules = SIGNAL_RULES): Signal[] {
  const sorted = [...symbols].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const out = sorted.map((s) => signalFor(s, rules));
  if (portfolio) ownerAmounts(out, new Map(sorted.map((s) => [s.symbol, s])), portfolio, rules);
  else for (const sig of out) if (sig.sizeTier !== "NONE" || sig.action === "REDUCE") sig.ownerNotes.push("No portfolio baseline, so no owner amount.");
  return out;
}

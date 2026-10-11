import type { ScoreResult } from "@/engine";
import type { Instrument } from "@/data/providers";
import { flags } from "@/config/flags";
import { statusView } from "@/engine/status";
import { httpsUrl, type SourceItem, type SourceKind } from "@/data/sources";
import { fill, formatDate, formatScorePercent, getMessages, type Locale } from "@/i18n";
import { reasonsFor, sectorLabel, stateKey } from "@/i18n/score-text";
import { type StateKey } from "@/i18n/rules";

/** Everything a table row needs, already localized and serializable for client components. */
export type ScreenRow = {
  ticker: string;
  name: string;
  sector: string;
  extension: boolean;
  date: string;
  dateLabel: string;
  total: number;
  percent: number | null;
  percentLabel: string | null;
  coreTotal: number;
  bonusLabel: string;
  fundamentals: number;
  technical: number;
  macro: number;
  state: StateKey;
  stateLabel: string;
  pullbackLabel: string | null;
  matched: string[] | null;
  markLabel: string;
  reasons: string[];
  agreementLabel: string | null;
  /** Slider step 0 to 4, or null when the ticker is not scored. */
  position: number | null;
  /** Points that had data, out of 25. */
  pointsKnown: number;
  /** "Catalyst (2), Macro data (3)", empty when every rule had data. */
  noDataRules: string;
  /** One sentence for screen readers: label, step, points, data. */
  statusAria: string;
  /** "Points not counted: 20" for criteria broken, else null. */
  pointsNote: string | null;
};

export function toRow(locale: Locale, { instrument, result }: { instrument: Instrument; result: ScoreResult }): ScreenRow {
  const m = getMessages(locale);
  const state = stateKey(result.state);
  const scored = state !== "insufficient";
  const adviceOutput = flags().ADVICE_OUTPUT;
  const view = statusView({ state, points: scored ? result.total : null, ruleHits: result.ruleHits, adviceOutput });
  const display = view.display;
  const label = m.status.labels[display.state];
  const aria = display.state === "insufficient" ? m.status.summaryAriaNone : display.state === "broken" ? m.status.summaryAriaBroken : m.status.summaryAria;
  return {
    ticker: instrument.ticker,
    name: instrument.name,
    sector: sectorLabel(locale, instrument.sector),
    extension: instrument.source === "sample extension" && process.env.DATA_MODE === "fixture",
    date: result.asOf,
    dateLabel: formatDate(locale, result.asOf),
    total: result.total,
    percent: display.percent,
    percentLabel: display.percent === null ? null : formatScorePercent(locale, display.percent),
    coreTotal: display.coreTotal,
    bonusLabel: display.bonus.map(({ id, hit }) => `${m.status.ruleShort[id]}: ${hit?.matched ? m.common.met : !hit || hit.unknown ? m.status.noData : m.common.notMet}`).join(", "),
    fundamentals: result.fundamentals,
    technical: result.technical,
    macro: result.macro,
    state: display.state,
    stateLabel: label,
    pullbackLabel: display.state === "watch" && result.pullbackInUptrend ? m.states.pullback : null,
    matched: scored ? result.ruleHits.filter((hit) => hit.matched).map((hit) => hit.id) : null,
    markLabel: scored ? formatScorePercent(locale, display.percent ?? 0) : m.mark.none,
    reasons: reasonsFor(locale, result),
    agreementLabel: result.agreement ? agreementSummary(m.agreement, Object.values(result.agreement)) : null,
    position: display.state === "insufficient" ? null : ["broken", "ignore", "wait", "watch", "setup"].indexOf(display.state),
    pointsKnown: display.coreKnown,
    noDataRules: display.unknownCore.map((id) => m.status.ruleShort[id]).join(", "),
    statusAria: fill(aria, { label, step: (["broken", "ignore", "wait", "watch", "setup"].indexOf(display.state) + 1), percent: formatScorePercent(locale, display.percent ?? 0), known: display.coreKnown, total: display.coreTotal }),
    pointsNote: display.state === "broken" ? m.status.pointsNotCountedPlain : null,
  };
}

/** Weakest agreement first: one disputed field labels the row disputed, and "both agree" only when every field is agree. */
const AGREEMENT_ORDER = ["disputed", "single", "verified_single", "data_rule", "xbrl_override"] as const;
function agreementSummary(labels: Record<(typeof AGREEMENT_ORDER)[number] | "agree", string>, values: string[]): string {
  return labels[AGREEMENT_ORDER.find((key) => values.includes(key)) ?? "agree"];
}

export const byScore = (a: ScreenRow, b: ScreenRow) => (b.percent ?? -1) - (a.percent ?? -1) || a.ticker.localeCompare(b.ticker);

/** One source as the page shows it: a localized label, an optional publish date and an https link only for displayable documents. */
export type SourceLink = { key: string; kind: SourceKind; label: string; date: string | null; dateLabel: string | null; href: string | null };

const KINDS: readonly SourceKind[] = ["release", "10-Q", "10-K", "8-K", "form4", "filing", "xbrl", "alphavantage", "fred", "vix", "prices", "pricesUniverse", "unstored"];
const NO_LINK: ReadonlySet<SourceKind> = new Set(["alphavantage", "fred", "vix", "prices", "pricesUniverse", "unstored"]);
const isKind = (value: string): value is SourceKind => (KINDS as readonly string[]).includes(value);
const plain = (kind: SourceKind): SourceItem => ({ kind, publishedAt: null, href: null });
const itemKey = (s: SourceItem) => s.href ?? `${s.kind}:${s.publishedAt ?? ""}`;

/** Stored sources of one consensus field. A verified SEC override always names SEC XBRL data and the EPS data rule always names Alpha Vantage, also on scores stored before sources existed. */
function fieldItems(result: ScoreResult, field: string): SourceItem[] {
  const out = (result.sources?.[field] ?? []).filter((s): s is SourceItem => isKind(s.kind));
  const agreement = result.agreement?.[field];
  // A Form 4 override (insider flag) names SEC Form 4; every other verified SEC override names SEC XBRL data.
  if (agreement === "xbrl_override" && field === "insiderOrInstitutionalBuying") { if (!out.some((s) => s.kind === "form4")) out.push(plain("form4")); }
  else if (agreement === "xbrl_override" && !out.some((s) => s.kind === "xbrl")) out.push(plain("xbrl"));
  if (agreement === "data_rule" && field === "epsBeat" && !out.some((s) => s.kind === "alphavantage")) out.push(plain("alphavantage"));
  return out;
}

type Spec = { fields?: [field: string, known: (r: ScoreResult) => boolean][]; fixed?: SourceKind[]; when?: (r: ScoreResult) => boolean };
const fund = (r: ScoreResult) => r.inputs.fundamentals;
const nn = (v: unknown) => v !== null && v !== undefined;
const RULE_SPECS: Record<string, Spec> = {
  "revenue-acceleration": { fields: [["revenueAccelerating", (r) => nn(fund(r).revenueAccelerating)], ["revenueDeclining", (r) => nn(fund(r).revenueDeclining)]] },
  earnings: { fields: [["epsBeat", (r) => nn(fund(r).epsBeat)], ["guidanceRaised", (r) => nn(fund(r).guidanceRaised)]] },
  catalyst: { fields: [["productCatalyst", (r) => nn(fund(r).productCatalyst)]] },
  accumulation: { fields: [["insiderOrInstitutionalBuying", (r) => nn(fund(r).insiderOrInstitutionalAccumulation)]] },
  "above-ma": { fixed: ["prices"] }, uptrend: { fixed: ["prices"] }, "green-volume": { fixed: ["prices"] }, dip: { fixed: ["prices"] },
  rotation: { fixed: ["pricesUniverse"], when: (r) => nn(r.inputs.macro.growthSectorRotation) },
  "macro-data": { fixed: ["fred", "vix"], when: (r) => nn(r.inputs.macro.dataTailwind) },
};
const INPUT_SPECS: Record<string, Spec> = {
  revenueAccelerating: RULE_SPECS["revenue-acceleration"],
  revenueGrowthCurrent: { fields: [["revenueAccelerating", (r) => nn(fund(r).revenueGrowthCurrent)]] },
  revenueGrowthPrior: { fields: [["revenueAccelerating", (r) => nn(fund(r).revenueGrowthPrior)]] },
  revenueDeclining: { fields: [["revenueDeclining", (r) => nn(fund(r).revenueDeclining)]] },
  epsBeat: { fields: [["epsBeat", (r) => nn(fund(r).epsBeat)]] },
  guidanceRaised: { fields: [["guidanceRaised", (r) => nn(fund(r).guidanceRaised)]] },
  earningsMissAndGuidanceCut: { fields: [["epsBeat", (r) => nn(fund(r).earningsMissAndGuidanceCut)], ["guidanceCut", (r) => nn(fund(r).earningsMissAndGuidanceCut)]] },
  guidanceCut: { fields: [["guidanceCut", (r) => nn(r.consensusValues?.guidanceCut)]] },
  narrativeChanged: { fields: [["narrativeChanged", (r) => nn(r.consensusValues?.narrativeChanged)]] },
  productCatalyst: RULE_SPECS.catalyst,
  insiderOrInstitutionalAccumulation: RULE_SPECS.accumulation,
  growthSectorRotation: RULE_SPECS.rotation,
  dataTailwind: RULE_SPECS["macro-data"],
};

function itemsFor(result: ScoreResult, spec: Spec | undefined): SourceItem[] {
  if (!spec || (spec.when && !spec.when(result))) return [];
  const out: SourceItem[] = [];
  for (const [field, known] of spec.fields ?? []) if (known(result)) out.push(...fieldItems(result, field));
  for (const kind of spec.fixed ?? []) out.push(plain(kind));
  const seen = new Set<string>();
  // A bare fallback item (no link, no date) adds nothing when the same kind is already named with more detail.
  const detailed = new Set(out.filter((s) => s.href || s.publishedAt).map((s) => s.kind));
  return out.filter((s) => { const key = itemKey(s); return !(detailed.has(s.kind) && !s.href && !s.publishedAt) && !seen.has(key) && !!seen.add(key); });
}

/** Localizes items. An href survives only as a plain https url on a kind that may be linked. */
export function toSourceLinks(locale: Locale, items: SourceItem[]): SourceLink[] {
  const { kinds, secItem } = getMessages(locale).sources;
  return items.map((s) => {
    const href = NO_LINK.has(s.kind) ? null : httpsUrl(s.href);
    const date = s.publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(s.publishedAt) ? s.publishedAt : null;
    return { key: itemKey({ ...s, href }), kind: s.kind, label: s.item ? fill(secItem, { item: s.item }) : kinds[s.kind], date, dateLabel: date ? formatDate(locale, date) : null, href };
  });
}
/** Sources for one rule row in "Rule by rule". Empty means "No source yet". */
export const ruleSources = (locale: Locale, result: ScoreResult, ruleId: string): SourceLink[] => toSourceLinks(locale, itemsFor(result, RULE_SPECS[ruleId]));
/** Sources for one line in "Structured inputs". Empty means "No source yet". */
export const inputSources = (locale: Locale, result: ScoreResult, inputKey: string): SourceLink[] => toSourceLinks(locale, itemsFor(result, INPUT_SPECS[inputKey]));
/** "Data sources: Earnings release (1), Form 4 (2), ..." over every rule on the page, each distinct source counted once. Null when there is none. */
export function sourceSummary(locale: Locale, result: ScoreResult): string | null {
  const m = getMessages(locale).sources;
  const all = new Map<string, SourceItem>();
  for (const spec of Object.values(RULE_SPECS)) for (const s of itemsFor(result, spec)) all.set(itemKey(s), s);
  const counts = KINDS.map((kind) => [kind, [...all.values()].filter((s) => s.kind === kind).length] as const).filter(([, n]) => n > 0);
  return counts.length ? `${m.summary}: ${counts.map(([kind, n]) => `${m.kinds[kind]} (${n})`).join(", ")}` : null;
}

/** One plain line under a rule row's sources: what the source is, optionally with a link. */
export type SourceNote = { key: string; text: string; href: string | null; linkLabel: string | null };

const READING_KEYS = { single: "readingSingle", verified_single: "readingChecked", agree: "readingTwo", xbrl_override: "readingSec" } as const;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Honest label under a rule row. Computed rules say where the numbers come from, an insider flag without a purchase
 * names the Form 4 check and its date range, model readings say how many readings back them, and unknown rows say
 * what fills them and when. `replacesSources` means the stored source chips would only repeat or contradict the note.
 */
export function ruleSourceNotes(locale: Locale, result: ScoreResult, ruleId: string, unknown: boolean): { notes: SourceNote[]; replacesSources: boolean } {
  const m = getMessages(locale).sources;
  const methodology = { href: `/${locale}/methodology#source-labels`, linkLabel: m.methodology };
  const spec = RULE_SPECS[ruleId];
  const computed = ruleId === "rotation" ? m.computedPrices : ruleId === "macro-data" ? m.computedMacro : null;
  if (unknown) return { notes: [{ key: "unknown", text: spec?.fixed ? m.unknownComputed : m.unknownReview, href: null, linkLabel: null }], replacesSources: true };
  if (computed) return { notes: [{ key: "computed", text: computed, ...methodology }], replacesSources: true };
  const notes: SourceNote[] = [];
  let replacesSources = false;
  if (ruleId === "accumulation" && result.inputs.fundamentals.insiderOrInstitutionalAccumulation === false && !itemsFor(result, spec).some((s) => s.kind === "form4" && (s.href || s.publishedAt))) {
    const end = Date.parse(`${result.asOf.slice(0, 10)}T00:00:00Z`);
    const range = Number.isNaN(end) ? { from: "", to: "" } : { from: isoDay(end - 90 * 86_400_000), to: isoDay(end) };
    const ticker = result.ticker;
    notes.push({ key: "insider-none", text: fill(m.insiderNone, { from: range.from ? formatDate(locale, range.from) : "", to: range.to ? formatDate(locale, range.to) : "" }), href: `/${locale}/insiders?ticker=${encodeURIComponent(ticker)}`, linkLabel: fill(m.insiderLink, { ticker }) });
    replacesSources = true;
  }
  const seen = new Set<string>();
  for (const [field, known] of spec?.fields ?? []) {
    const agreement = result.agreement?.[field];
    if (!known(result) || !agreement || !(agreement in READING_KEYS) || seen.has(agreement)) continue;
    if (replacesSources && field === "insiderOrInstitutionalBuying") continue;
    seen.add(agreement);
    notes.push({ key: `reading-${agreement}`, text: m[READING_KEYS[agreement as keyof typeof READING_KEYS]], href: null, linkLabel: null });
  }
  return { notes, replacesSources };
}

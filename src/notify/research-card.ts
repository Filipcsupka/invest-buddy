import { ALERT_TEXT, BAND_EMOJI, TELEGRAM_LIMIT, escapeHtml, type AlertLocale } from "./format";
import type { PipelineState } from "../research/types";
import type { CatalystEvent } from "../data/catalyst-calendar";
import type { UpcomingEvent } from "../data/macro-calendar";
import { canDisplay } from "../data/sources-registry";
import { ESTIMATE_REVISION_SOURCE_NAME, type EstimateRevisionFact } from "../data/estimate-revisions";
import type { Graduation, GraduationCondition } from "../engine/graduation";
import { fill, formatNumber, plural } from "../i18n";
import { ownerResearchMessages } from "../i18n/owner-research-messages";

export interface ResearchLine { text: string; findingIds: string[] }
export interface ResearchFact {
  key: string; findingId: string; verified: boolean; confirmed: boolean; sourceClass: string | null;
  sourceName: string; url: string; claim: string; figures: { label: string; value: string }[];
}
export interface ResearchCardInput {
  symbol: string; locale: AlertLocale; site: string; state: PipelineState; stateSince: string;
  history: { state: string; date: string }[]; promotionStatus: string; scorable: boolean;
  card: { verdict: string; whatHappened: ResearchLine[]; whyItMatters: ResearchLine[]; opportunityCost: string | null } | null;
  facts: ResearchFact[]; upgradeTriggers: string[]; invalidation: string[]; cashEur?: number | null;
  /** Owner-side dates and next tier (P7). Absent or empty adds no section. */
  context?: OwnerContext | null;
}

/** Owner-side facts shown on the research card and the owner research page. */
export interface OwnerContext {
  /** Earliest stored catalyst for the symbol (next earnings or a dated verified finding). */
  nextCatalyst: CatalystEvent | null;
  /** Macro events on the next macro event date (several when they fall on one day). */
  macro: UpcomingEvent[];
  /** Code-written graduation conditions; owner only. */
  graduation: Graduation | null;
  /** Forward EPS estimate revision; owner only, always null for a public audience. */
  revision: EstimateRevisionFact | null;
}

const CLAIM_MAX = 140;
const signed = (locale: AlertLocale, value: number, digits: number) => `${value > 0 ? "+" : ""}${formatNumber(locale, value, digits)}`;
const when = (locale: AlertLocale, days: number) => days <= 0 ? ownerResearchMessages[locale].today : plural(locale, ownerResearchMessages[locale].days, days);

/** "Next catalyst: ..." for the earliest stored catalyst, or null. Plain text; callers escape it. */
export function catalystLine(event: CatalystEvent | null, locale: AlertLocale): string | null {
  if (!event) return null;
  const m = ownerResearchMessages[locale];
  if (event.type === "earnings") {
    const notes = [event.previousReportDate ? fill(m.moved, { date: event.previousReportDate }) : null, event.stale ? m.stale : null].filter(Boolean);
    const text = fill(m.earnings, { date: event.date, time: event.timeOfDay ? m.time[event.timeOfDay] : "", when: when(locale, event.daysUntil) });
    return fill(m.nextCatalyst, { event: notes.length ? `${text}, ${notes.join(", ")}` : text });
  }
  const claim = event.claim.length > CLAIM_MAX ? `${event.claim.slice(0, CLAIM_MAX - 3).trimEnd()}...` : event.claim;
  const text = fill(m.research, { kind: event.kind, date: event.date, when: when(locale, event.daysUntil), claim });
  return fill(m.nextCatalyst, { event: event.confirmed ? text : `${text} (${m.unconfirmed})` });
}

/** "Next macro event: ..." for the events on the next macro date, or null. */
export function macroLine(events: readonly UpcomingEvent[], locale: AlertLocale): string | null {
  if (!events.length) return null;
  const m = ownerResearchMessages[locale];
  const parts = events.map((e) => fill(m.macroEvent, {
    label: m.macroKinds[e.kind], date: e.date, when: e.sessions === 0 ? m.today : plural(locale, m.sessions, e.sessions),
  }));
  return fill(m.macro, { events: parts.join(", ") });
}

function conditionText(c: GraduationCondition, locale: AlertLocale): string | null {
  const m = ownerResearchMessages[locale];
  if (c.id === "score") return c.score ? fill(m.score, c.score) : null;
  if (c.id === "company" || c.id === "catalyst") {
    if (!c.rating) return null;
    const rules = (c.missingRules ?? []).map((r) => fill(r.carried ? m.ruleCarried : m.ruleMissing, { rule: m.rules[r.id] ?? r.id, points: r.points }));
    const details = [
      fill(m.ratingNow, { have: m.ratings[c.rating.have], points: c.rating.points, max: c.rating.max }) + (c.pointsShort ? `, ${fill(m.short, { n: c.pointsShort })}` : ""),
      ...(rules.length ? [fill(m.open, { rules: rules.join(", ") })] : []),
      ...(c.rating.narrativeLowers ? [m.narrative] : []),
    ];
    return fill(m.rating, { group: m.groups[c.id], need: m.ratings[c.rating.need], details: details.join("; ") });
  }
  if (c.id === "execution") return m.execution;
  const fields = (c.carriedFields ?? []).map((f) => fill(m.carried, { field: f.field, date: f.carriedFrom }));
  return fill(m.freshData, { fields: fields.length ? fields.join(", ") : m.keyFields });
}

/** "Next tier: STANDARD needs ..." from the structured conditions of the next tier, or null when there is no open condition. Owner only. */
export function graduationLine(g: Graduation | null, locale: AlertLocale): string | null {
  const step = g?.next ? g.steps.find((s) => s.tier === g.next) : undefined;
  if (!step) return null;
  const open = step.conditions.filter((c) => !c.met).map((c) => conditionText(c, locale)).filter((t): t is string => !!t);
  if (!open.length) return null;
  const m = ownerResearchMessages[locale];
  return fill(m.graduation, { tier: m.tiers[step.tier], conditions: open.join("; ") });
}

/** Estimate revision line for the owner. null for any other audience while Alpha Vantage may not be displayed. */
export function revisionLine(fact: EstimateRevisionFact | null, locale: AlertLocale, audience: "owner" | "public"): string | null {
  if (!fact || (audience !== "owner" && !canDisplay(fact.sourceId))) return null;
  const m = ownerResearchMessages[locale];
  const estimate = fact.currentEstimate === null ? m.noEstimate : fill(m.estimate, { value: formatNumber(locale, fact.currentEstimate, 2) });
  const windows = fact.windows.map((w) => fill(m.window, {
    days: w.days, change: w.change === null ? m.notAvailable : `${signed(locale, w.change, 2)}${w.changePct === null ? "" : ` (${signed(locale, w.changePct, 2)}%)`}`,
  })).join(", ");
  return fill(m.revision, { date: fact.reportDate, estimate, windows, source: ESTIMATE_REVISION_SOURCE_NAME });
}

/** The owner context lines in card order: next catalyst, macro event, graduation, estimate revision. Missing facts are left out. */
export function ownerContextLines(context: OwnerContext | null | undefined, locale: AlertLocale, audience: "owner" | "public" = "owner"): string[] {
  if (!context) return [];
  return [
    catalystLine(context.nextCatalyst, locale), macroLine(context.macro, locale),
    audience === "owner" ? graduationLine(context.graduation, locale) : null, revisionLine(context.revision, locale, audience),
  ].filter((line): line is string => !!line);
}

const LABELS = {
  en: { happened: "What happened", why: "Why it matters", setup: "Setup: not rated, outside the scored universe", numbers: "Numbers", plan: "Plan", now: "Now", upgrade: "Upgrade", invalidation: "Invalidation", cost: "Opportunity cost", evidence: "Evidence", coverage: "Coverage", pipeline: "Pipeline", owner: "Owner page", unconfirmed: "UNCONFIRMED", notScored: "not scored yet", outside: "outside scoring coverage", proposed: "promotion proposed" },
  sk: { happened: "Čo sa stalo", why: "Prečo na tom záleží", setup: "Nastavenie: nehodnotené, mimo bodovaného výberu", numbers: "Čísla", plan: "Plán", now: "Teraz", upgrade: "Potvrdenie", invalidation: "Čo zmení záver", cost: "Náklady príležitosti", evidence: "Dôkazy", coverage: "Pokrytie", pipeline: "História", owner: "Stránka vlastníka", unconfirmed: "NEPOTVRDENÉ", notScored: "zatiaľ nebodované", outside: "mimo pokrytia skórovania", proposed: "navrhnuté zaradenie" },
} as const;

/** Returns null unless a checked fact supports at least one What happened line. */
/** Plain call shown first on a card: [English, Slovak]. START_READY and ADD_READY are the only buy calls; everything else waits, reduces or is out. */
const VERDICT: Record<ResearchCardInput["state"], [string, string]> = {
  DISCOVERED: ["WAIT", "ČAKAJ"], WATCH: ["WAIT", "ČAKAJ"], START_READY: ["BUY", "KÚPIŤ"], ADD_READY: ["BUY MORE", "DOKÚPIŤ"],
  HOLD: ["HOLD", "DRŽAŤ"], REDUCE: ["REDUCE", "ZNÍŽIŤ"], BROKEN: ["OUT", "VON"], DROPPED: ["OUT", "VON"],
};

export function formatResearchCard(input: ResearchCardInput): string | null {
  const t = LABELS[input.locale];
  const byId = new Map(input.facts.map(f => [f.findingId, f]));
  const line = (item: ResearchLine) => {
    const facts = item.findingIds.map(id => byId.get(id)).filter((f): f is ResearchFact => !!f && f.verified);
    if (!facts.length) return null;
    return `• ${escapeHtml(item.text)}${facts.every(f => !f.confirmed) ? ` (${t.unconfirmed})` : ""}`;
  };
  const happened = (input.card?.whatHappened ?? []).map(line).filter((s): s is string => !!s).slice(0, 3);
  if (!happened.length) return null;
  const why = (input.card?.whyItMatters ?? []).map(line).filter((s): s is string => !!s).slice(0, 2);
  const state = escapeHtml(input.state);
  const symbol = escapeHtml(input.symbol);
  const band = input.state === "BROKEN" || input.state === "REDUCE" || input.state === "DROPPED" ? "red"
    : input.state === "START_READY" || input.state === "ADD_READY" ? "green" : "blue";
  const call = VERDICT[input.state][input.locale === "sk" ? 1 : 0];
  const head = `${BAND_EMOJI[band]} <b>${symbol}</b>${input.scorable ? ` · <b>${call}</b>` : ""} · ${state} · EUR 0`;
  const sections: { priority: number; lines: string[] }[] = [
    { priority: 5, lines: [`<b>${t.happened}</b>`, ...happened] },
    ...(why.length ? [{ priority: 4, lines: [`<b>${t.why}</b>`, ...why] }] : []),
    { priority: 2, lines: [t.setup] },
  ];
  const context = ownerContextLines(input.context, input.locale);
  if (context.length) sections.push({ priority: 2.5, lines: [`<b>${ownerResearchMessages[input.locale].title}</b>`, ...context.map(l => `• ${escapeHtml(l)}`)] });
  const figures = input.facts.filter(f => f.verified).flatMap(f => f.figures).slice(0, 5);
  if (figures.length) sections.push({ priority: 1, lines: [`<b>${t.numbers}</b>`, ...figures.map(f => `• ${escapeHtml(f.label)}: ${escapeHtml(f.value)}`)] });
  const plan = [`${t.now}: ${state}, EUR 0`];
  if (input.upgradeTriggers[0]) plan.push(`${t.upgrade}: ${escapeHtml(input.upgradeTriggers[0])}`);
  if (input.invalidation[0]) plan.push(`${t.invalidation}: ${escapeHtml(input.invalidation[0])}`);
  const cost = [input.card?.opportunityCost, input.cashEur == null ? null : `cash EUR ${input.cashEur}`].filter(Boolean).join(" · ");
  if (cost) plan.push(`${t.cost}: ${escapeHtml(cost)}`);
  sections.push({ priority: 3, lines: [`<b>${t.plan}</b>`, ...plan] });
  const evidence = input.facts.filter(f => f.verified && /^https:\/\//.test(f.url))
    .sort((a, b) => Number(b.sourceClass === "primary") - Number(a.sourceClass === "primary"))
    .slice(0, 4).map(f => `• <a href="${escapeHtml(f.url)}">${escapeHtml(f.sourceName)}</a>${f.confirmed ? "" : ` (${t.unconfirmed})`}`);
  const verified = input.facts.filter(f => f.verified);
  const primary = verified.filter(f => f.sourceClass === "primary").length;
  const press = verified.filter(f => f.sourceClass === "press").length;
  const other = verified.length - primary - press;
  const unconfirmed = verified.filter(f => !f.confirmed).length;
  const coverage = `${t.coverage}: ${verified.length} (${primary} primary, ${press} press${other ? `, ${other} other` : ""}), ${unconfirmed} ${t.unconfirmed.toLowerCase()} · ${input.scorable ? t.notScored : t.outside}`;
  const history = input.history.slice(-4).map(h => `${escapeHtml(h.state)} ${escapeHtml(h.date.slice(5))}`).join(" → ") || `${state} ${escapeHtml(input.stateSince.slice(5))}`;
  const pipeline = `${t.pipeline}: ${history}${input.promotionStatus === "proposed" ? ` · ${t.proposed}` : ""}`;
  const site = input.site.replace(/\/+$/, "");
  const links = `<a href="${escapeHtml(`${site}/${input.locale}/owner/research/${encodeURIComponent(input.symbol)}`)}">${t.owner}</a> · <a href="${escapeHtml(`${site}/${input.locale}/methodology`)}">${escapeHtml(ALERT_TEXT[input.locale].methodology)}</a>`;
  const supportedId = input.card?.whatHappened.find(item => item.findingIds.some(id => byId.get(id)?.verified))?.findingIds.find(id => byId.get(id)?.verified);
  const verdict = supportedId ? byId.get(supportedId)?.claim ?? "" : "";
  const render = (parts: typeof sections, sources: string[]) => [head, escapeHtml(verdict),
    ...parts.sort((a, b) => b.priority - a.priority).flatMap(s => ["", ...s.lines]),
    ...(sources.length ? ["", `<b>${t.evidence}</b>`, ...sources] : []), "", escapeHtml(coverage), escapeHtml(pipeline), links,
    escapeHtml(ALERT_TEXT[input.locale].disclaimer)].join("\n");
  let parts = sections; let sources = evidence; let output = render(parts, sources);
  while (output.length > TELEGRAM_LIMIT && parts.length > 1) {
    const lowest = Math.min(...parts.filter(s => s.priority !== 5).map(s => s.priority));
    parts = parts.filter(s => s.priority !== lowest); output = render(parts, sources);
  }
  while (output.length > TELEGRAM_LIMIT && sources.length) { sources = sources.slice(0, -1); output = render(parts, sources); }
  return output.length <= TELEGRAM_LIMIT ? output : null;
}

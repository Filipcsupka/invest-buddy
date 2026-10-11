import { ALERT_TEXT, BAND_EMOJI, TELEGRAM_LIMIT, escapeHtml, type AlertLocale } from "./format";
import type { PipelineState } from "../research/types";

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
}

const LABELS = {
  en: { happened: "What happened", why: "Why it matters", setup: "Setup: not rated, outside the scored universe", numbers: "Numbers", plan: "Plan", now: "Now", upgrade: "Upgrade", invalidation: "Invalidation", cost: "Opportunity cost", evidence: "Evidence", coverage: "Coverage", pipeline: "Pipeline", owner: "Owner page", unconfirmed: "UNCONFIRMED", notScored: "not scored yet", outside: "outside scoring coverage", proposed: "promotion proposed" },
  sk: { happened: "Čo sa stalo", why: "Prečo na tom záleží", setup: "Nastavenie: nehodnotené, mimo bodovaného výberu", numbers: "Čísla", plan: "Plán", now: "Teraz", upgrade: "Potvrdenie", invalidation: "Čo zmení záver", cost: "Náklady príležitosti", evidence: "Dôkazy", coverage: "Pokrytie", pipeline: "História", owner: "Stránka vlastníka", unconfirmed: "NEPOTVRDENÉ", notScored: "zatiaľ nebodované", outside: "mimo pokrytia skórovania", proposed: "navrhnuté zaradenie" },
} as const;

/** Returns null unless a checked fact supports at least one What happened line. */
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
  const head = `${BAND_EMOJI[band]} <b>${symbol}</b> · ${state} · EUR 0`;
  const sections: { priority: number; lines: string[] }[] = [
    { priority: 5, lines: [`<b>${t.happened}</b>`, ...happened] },
    ...(why.length ? [{ priority: 4, lines: [`<b>${t.why}</b>`, ...why] }] : []),
    { priority: 2, lines: [t.setup] },
  ];
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

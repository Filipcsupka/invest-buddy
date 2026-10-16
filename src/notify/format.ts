/** Telegram HTML event alert: one message per ticker that moved between status bands. EN and SK. Also the idea card (AL3). */
import type { StoredIdea } from "../db/ideas";
import { stripEur } from "../ideas/public";
import { getMessages } from "../i18n";

export type AlertLocale = "en" | "sk";
export type Band = "red" | "orange" | "yellow" | "blue" | "green" | "gray";
export type ConfirmationKey = "revenue" | "eps" | "guidance" | "catalyst" | "volume" | "insider";

/** Engine state names as stored in alerts (see AlertState in the engine). */
export type StateName = "Setup met (>=18)" | "Watch" | "Wait" | "Ignore" | "Criteria broken" | "Insufficient/invalid data";

export interface StatusPoint { state: StateName; points: number | null }
export interface Coverage { known: number; total: number }

/** One rule that changed state since the previous day. Only these fields reach the message; no vendor inputs. */
export interface AlertRuleChange { label: string; from: "pass" | "fail" | "unknown"; to: "pass" | "fail" | "unknown" }
export const MAX_RULE_LINES = 3;

export interface EventAlertInput {
  ticker: string;
  locale: AlertLocale;
  /** Null for a first rating. */
  previous: StatusPoint | null;
  current: StatusPoint;
  /** Optional until ST1 supplies them. Absent means the line is left out, not "none". */
  confirmations?: ConfirmationKey[];
  coverage?: Coverage;
  /** Rules whose state changed vs the previous day. Pass to fail and anything to pass get a line (max 3); a move to unknown does not. */
  ruleChanges?: AlertRuleChange[];
  /** ADVICE_OUTPUT. Off: "Conditions met". On: "Buy zone". */
  adviceOutput: boolean;
  site: string;
}

export const MAX_POINTS = 25;
export const SLIDER = ["red", "orange", "yellow", "blue", "green"] as const;
export const BAND_EMOJI: Record<Band, string> = { red: "🔴", orange: "🟠", yellow: "🟡", blue: "🔵", green: "🟢", gray: "⚪" };

// Local band table from the lane spec (docs/roadmap/lane-status.md). ST1 (src/engine/status.ts) replaces it.
const BAND_OF_STATE: Record<StateName, Band> = {
  "Criteria broken": "red",
  Ignore: "orange",
  Wait: "yellow",
  Watch: "blue",
  "Setup met (>=18)": "green",
  "Insufficient/invalid data": "gray",
};

export function bandOf(state: StateName): Band { return BAND_OF_STATE[state]; }

/** Position on the five-step slider, or null when the state has no position (not enough data). */
export function sliderPosition(band: Band): number | null {
  const index = (SLIDER as readonly string[]).indexOf(band);
  return index < 0 ? null : index;
}

type BandLabels = Record<Band, string>;
interface Text {
  bands: BandLabels;
  /** Replaces bands.green when ADVICE_OUTPUT is on. */
  greenAdvice: string;
  noData: string;
  was: string;
  now: string;
  first: string;
  confirmations: string;
  noLongerMeets: string;
  nowMeets: string;
  chips: Record<ConfirmationKey, string>;
  coverage: (known: number, total: number) => string;
  open: (ticker: string) => string;
  methodology: string;
  disclaimer: string;
}

export const ALERT_TEXT: Record<AlertLocale, Text> = {
  en: {
    bands: { red: "Criteria broken", orange: "Not now", yellow: "Waiting", blue: "Watching", green: "Conditions met", gray: "Not enough data" },
    greenAdvice: "Buy zone",
    noData: "no data",
    was: "Was",
    now: "Now",
    first: "First rating",
    confirmations: "Confirmations",
    noLongerMeets: "No longer meets",
    nowMeets: "Now meets",
    chips: { revenue: "Revenue growth", eps: "EPS", guidance: "Guidance raised", catalyst: "Product catalyst", volume: "Volume", insider: "Insiders (Form 4)" },
    coverage: (known, total) => `Data: ${known} of ${total} points have verified sources`,
    open: (ticker) => `Open ${ticker}`,
    methodology: "Methodology",
    disclaimer: "Informational screening under the published methodology, not personal advice.",
  },
  sk: {
    bands: { red: "Kritériá porušené", orange: "Mimo výberu", yellow: "Čakanie", blue: "Sledovanie", green: "Podmienky splnené", gray: "Nedostatok údajov" },
    greenAdvice: "Zóna nákupu",
    noData: "bez údajov",
    was: "Bolo",
    now: "Teraz",
    first: "Prvé hodnotenie",
    confirmations: "Potvrdenia",
    noLongerMeets: "Už nespĺňa",
    nowMeets: "Teraz spĺňa",
    chips: { revenue: "Rast tržieb", eps: "EPS", guidance: "Zvýšený výhľad", catalyst: "Produktový katalyzátor", volume: "Objem", insider: "Insideri (Form 4)" },
    coverage: (known, total) => `Údaje: ${known} z ${total} bodov má overené zdroje`,
    open: (ticker) => `Otvoriť ${ticker}`,
    methodology: "Metodika",
    disclaimer: "Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.",
  },
};

/** Escapes text for Telegram HTML parse mode. Quotes too, so the result is safe inside an href. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function bandLabel(locale: AlertLocale, band: Band, adviceOutput: boolean): string {
  const text = ALERT_TEXT[locale];
  return band === "green" && adviceOutput ? text.greenAdvice : text.bands[band];
}

/** Points text. Missing data is "no data", never 0. A not-enough-data state has no points. */
function pointsText(point: StatusPoint): string | null {
  if (bandOf(point.state) === "gray" || point.points === null || !Number.isFinite(point.points)) return null;
  return String(point.points);
}

/** Slider line and the marker line below it. Not-enough-data has no slider, only a gray dot. */
export function sliderLines(band: Band): string[] {
  const position = sliderPosition(band);
  if (position === null) return [];
  const marker = SLIDER.map((_, index) => (index === position ? "⬆️" : "▫️")).join("");
  return [SLIDER.map((step) => BAND_EMOJI[step]).join(""), marker];
}

function stepText(locale: AlertLocale, point: StatusPoint, adviceOutput: boolean, withLabel: boolean): string {
  const band = bandOf(point.state);
  const text = ALERT_TEXT[locale];
  const points = pointsText(point);
  const label = withLabel ? ` ${escapeHtml(bandLabel(locale, band, adviceOutput))}` : "";
  const shown = points === null ? escapeHtml(text.noData) : points;
  return `${BAND_EMOJI[band]}${label} (${shown})`;
}

export function formatEventAlert(input: EventAlertInput): string {
  const { locale, adviceOutput } = input;
  const text = ALERT_TEXT[locale];
  const ticker = escapeHtml(input.ticker);
  const band = bandOf(input.current.state);
  const lines: string[] = [`${BAND_EMOJI[band]} <b>${ticker}</b> · ${escapeHtml(bandLabel(locale, band, adviceOutput))}`, ...sliderLines(band)];

  const points = pointsText(input.current);
  const nowText = points === null ? `${BAND_EMOJI[band]} (${escapeHtml(text.noData)})` : `${BAND_EMOJI[band]} (${points} / ${MAX_POINTS})`;
  lines.push(input.previous
    ? `${text.was}: ${stepText(locale, input.previous, adviceOutput, true)} → ${text.now}: ${nowText}`
    : `${text.first}: ${nowText}`);

  for (const change of (input.ruleChanges ?? []).filter((c) => c.to === "pass" || (c.from === "pass" && c.to === "fail")).slice(0, MAX_RULE_LINES)) {
    lines.push(`${change.to === "pass" ? text.nowMeets : text.noLongerMeets}: ${escapeHtml(change.label)}`);
  }
  if (input.confirmations?.length) lines.push(`${text.confirmations}: ${input.confirmations.map((key) => `✓ ${escapeHtml(text.chips[key])}`).join(" ")}`);
  if (input.coverage) lines.push(escapeHtml(text.coverage(input.coverage.known, input.coverage.total)));

  const site = input.site.replace(/\/+$/, "");
  const company = `${site}/${locale}/company/${encodeURIComponent(input.ticker)}`;
  const method = `${site}/${locale}/methodology`;
  lines.push(`<a href="${escapeHtml(company)}">${escapeHtml(text.open(input.ticker))}</a> · <a href="${escapeHtml(method)}">${escapeHtml(text.methodology)}</a>`);
  lines.push(escapeHtml(text.disclaimer));
  return lines.join("\n");
}

// ---- Idea card (AL3) ----

/** public: neutral labels, no EUR, no action words (ADR-001). owner: adds the action word and the EUR band; for a private channel only. */
export type CardMode = "public" | "owner";
export const TELEGRAM_LIMIT = 4096;

export function cardModeFromEnv(value: string | undefined): CardMode { return value?.trim() === "owner" ? "owner" : "public"; }

/** Relative score fields of the stored audit (EN45). All optional: audits stored before rules version 2026-10-11.1 lack them. */
export interface CardAudit { evidencedMax?: number; percent?: number; coverage?: number }

export interface IdeaCardInput {
  ticker: string;
  locale: AlertLocale;
  previous: StatusPoint | null;
  current: StatusPoint;
  idea: StoredIdea;
  audit?: CardAudit;
  mode: CardMode;
  /** ADVICE_OUTPUT. Off in public mode: the card shows no model text, ratings or plan (docs/wording-gate.md). */
  adviceOutput: boolean;
  site: string;
  research?: { coverage: string; history: string; unconfirmed?: boolean; ownerPath?: string; evidence?: { url: string; label: string }[] };
}

interface CardText {
  scoreRelative: (points: number, max: number, percent: number, coverage: number) => string;
  scorePlain: (points: number) => string;
  whatHappened: string; whyItMatters: string; setup: string; company: string; entry: string; catalyst: string;
  numbers: string; plan: string; evidence: string;
  ratings: Record<string, string>;
  planOwner: { start: string; add: string; stop: string; cost: string };
  planPublic: { trigger: string; invalidation: string; cost: string };
}

const CARD_TEXT: Record<AlertLocale, CardText> = {
  en: {
    scoreRelative: (p, m, pct, cov) => `Score ${p} of ${m} evidenced (${pct} %), data coverage ${cov} %`,
    scorePlain: (p) => `Score ${p} points`,
    whatHappened: "What happened", whyItMatters: "Why it matters", setup: "Setup", company: "Company", entry: "Entry", catalyst: "Catalyst", numbers: "Numbers", plan: "Plan", evidence: "Evidence",
    ratings: { "Very strong": "Very strong", Strong: "Strong", Good: "Good", Neutral: "Neutral", Weak: "Weak" },
    planOwner: { start: "When to start", add: "When to add", stop: "When to stop", cost: "Opportunity cost" },
    planPublic: { trigger: "Trigger", invalidation: "Invalidation", cost: "Opportunity cost" },
  },
  sk: {
    scoreRelative: (p, m, pct, cov) => `Skóre ${p} z ${m} doložených (${pct} %), pokrytie údajov ${cov} %`,
    scorePlain: (p) => `Skóre ${p} bodov`,
    whatHappened: "Čo sa stalo", whyItMatters: "Prečo na tom záleží", setup: "Nastavenie", company: "Firma", entry: "Vstup", catalyst: "Katalyzátor", numbers: "Čísla", plan: "Plán", evidence: "Dôkazy",
    ratings: { "Very strong": "Veľmi silné", Strong: "Silné", Good: "Dobré", Neutral: "Neutrálne", Weak: "Slabé" },
    planOwner: { start: "Kedy začať", add: "Kedy prikúpiť", stop: "Kedy skončiť", cost: "Náklady príležitosti" },
    planPublic: { trigger: "Spúšťač", invalidation: "Čo nápad zruší", cost: "Náklady príležitosti" },
  },
};

type CardBody = Pick<StoredIdea, "whatHappened" | "whyItMatters" | "numbers" | "plan" | "evidence">;

/** Slovak fields from the stored translation when present, else the English text. */
function localizedBody(idea: StoredIdea, locale: AlertLocale): CardBody {
  const sk = locale === "sk" ? idea.translations?.sk : undefined;
  return sk ? { whatHappened: sk.whatHappened, whyItMatters: sk.whyItMatters, numbers: sk.numbers, plan: sk.plan, evidence: sk.evidence } : idea;
}

const ACTION_CODE = /\b(?:START_POSITION|HIGH_CONVICTION_ADD|ADD|REDUCE|THESIS_BROKEN)\b/;
const PUBLIC_RESEARCH_BANNED = /\b(?:EUR|buy|sell|hold|add|reduce|target|rating|recommend|outperform|underperform|start.position|high.conviction|add.ready|start.ready|thesis.broken)\b|€/i;
const bullet = (value: string) => `• ${escapeHtml(value)}`;
const field = (label: string, value: string) => `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;

interface Section { priority: number; lines: string[] }

/**
 * One message per ticker with a stored idea. Text over 4096 characters loses whole sections, lowest priority first
 * (numbers, setup, plan, why, what happened), then evidence links from the end. A link is never cut in half.
 */
export function formatIdeaCard(input: IdeaCardInput): string {
  const { locale, mode, adviceOutput } = input;
  const text = ALERT_TEXT[locale];
  const card = CARD_TEXT[locale];
  const owner = mode === "owner";
  // Public: ADR-001 strips EUR everywhere. The gate (docs/wording-gate.md) also hides model text, ratings and plan while ADVICE_OUTPUT is off.
  const showModelText = owner || adviceOutput;
  const idea = owner ? input.idea : stripEur(input.idea);
  const body = localizedBody(idea, locale);
  const keep = (value: string) => owner || !ACTION_CODE.test(value);

  const band = bandOf(input.current.state);
  const ticker = escapeHtml(input.ticker);
  // The card always uses the neutral band label; the action word is separate and owner-only.
  const label = (b: Band) => escapeHtml(bandLabel(locale, b, false));
  const head = [`${BAND_EMOJI[band]} <b>${ticker}</b> · ${label(band)}`];
  if (owner) {
    const action = getMessages(locale).ideas.actions[input.idea.action];
    const eur = input.idea.amountMaxEur > 0 ? ` · EUR ${input.idea.amountMinEur}-${input.idea.amountMaxEur}` : "";
    head[0] += ` · ${escapeHtml(action)}${eur}`;
  }
  const now = `${BAND_EMOJI[band]} ${label(band)}`;
  const change = input.previous
    ? `${text.was}: ${BAND_EMOJI[bandOf(input.previous.state)]} ${label(bandOf(input.previous.state))} → ${text.now}: ${now}`
    : `${text.first}: ${now}`;
  const audit = input.audit;
  const points = pointsText(input.current);
  const score = points === null ? escapeHtml(text.noData)
    : audit?.evidencedMax && audit.percent !== undefined && audit.coverage !== undefined
      ? escapeHtml(card.scoreRelative(Number(points), audit.evidencedMax, Math.round(audit.percent), Math.round(audit.coverage)))
      : escapeHtml(card.scorePlain(Number(points)));

  const sections: Section[] = [];
  if (showModelText) {
    const happened = body.whatHappened.filter(keep).slice(0, 3);
    if (happened.length) sections.push({ priority: 5, lines: [`<b>${escapeHtml(card.whatHappened)}</b>`, ...happened.map(bullet)] });
    const why = body.whyItMatters.filter(keep).slice(0, 2);
    if (why.length) sections.push({ priority: 4, lines: [`<b>${escapeHtml(card.whyItMatters)}</b>`, ...why.map(bullet)] });
    const ratings: [string, keyof StoredIdea["setup"]][] = [[card.company, "company"], [card.entry, "entry"], [card.catalyst, "catalyst"]];
    sections.push({ priority: 2, lines: [`<b>${escapeHtml(card.setup)}</b>`, ratings.map(([label, key]) => `${escapeHtml(label)}: ${escapeHtml(card.ratings[idea.setup[key]] ?? idea.setup[key])}`).join(" · ")] });
    const numbers = body.numbers.filter((n) => keep(n.label) && keep(n.value)).slice(0, 5);
    if (numbers.length) sections.push({ priority: 1, lines: [`<b>${escapeHtml(card.numbers)}</b>`, ...numbers.map((n) => `• ${escapeHtml(n.label)}: ${escapeHtml(n.value)}`)] });
    const plan: string[] = [];
    if (owner) {
      const labels = card.planOwner;
      if (body.plan.amountNow) plan.push(field(labels.start, body.plan.amountNow));
      if (body.plan.trigger) plan.push(field(labels.add, body.plan.trigger));
      if (body.plan.invalidation) plan.push(field(labels.stop, body.plan.invalidation));
      if (body.plan.opportunityCost) plan.push(field(labels.cost, body.plan.opportunityCost));
    } else {
      const labels = card.planPublic;
      if (body.plan.trigger && keep(body.plan.trigger)) plan.push(field(labels.trigger, body.plan.trigger));
      if (body.plan.invalidation && keep(body.plan.invalidation)) plan.push(field(labels.invalidation, body.plan.invalidation));
      if (body.plan.opportunityCost && keep(body.plan.opportunityCost)) plan.push(field(labels.cost, body.plan.opportunityCost));
    }
    if (plan.length) sections.push({ priority: 3, lines: [`<b>${escapeHtml(card.plan)}</b>`, ...plan] });
  }

  const site = input.site.replace(/\/+$/, "");
  const company = `${site}/${locale}/company/${encodeURIComponent(input.ticker)}`;
  const method = `${site}/${locale}/methodology`;
  const links = `<a href="${escapeHtml(company)}">${escapeHtml(text.open(input.ticker))}</a> · <a href="${escapeHtml(method)}">${escapeHtml(text.methodology)}</a>`;
  const evidence = body.evidence.filter((e) => keep(e.label)).map((e) => `• <a href="${escapeHtml(e.url)}">${escapeHtml(e.label)}</a>`);
  if (input.research?.evidence) for (const item of input.research.evidence) {
    if (/^https:\/\//.test(item.url) && (owner || !PUBLIC_RESEARCH_BANNED.test(item.label))) evidence.push(`• <a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>`);
  }
  let researchLines = input.research && owner ? [
    escapeHtml(input.research.coverage), escapeHtml(input.research.history),
    ...(input.research.unconfirmed ? [locale === "sk" ? "NEPOTVRDENÉ" : "UNCONFIRMED"] : []),
  ] : [];
  const ownerLink = owner && input.research?.ownerPath ? ` · <a href="${escapeHtml(`${site}/${locale}${input.research.ownerPath}`)}">${locale === "sk" ? "Stránka vlastníka" : "Owner page"}</a>` : "";

  const render = (parts: Section[], evidenceLines: string[]): string => [
    ...head, change, score,
    ...parts.sort((a, b) => b.priority - a.priority).flatMap((s) => ["", ...s.lines]),
    ...(evidenceLines.length ? ["", `<b>${escapeHtml(card.evidence)}</b>`, ...evidenceLines] : []),
    ...(researchLines.length ? ["", ...researchLines] : []),
    "", links + ownerLink, escapeHtml(text.disclaimer),
  ].join("\n");

  let parts = sections;
  let evidenceLines = evidence;
  let out = render(parts, evidenceLines);
  while (out.length > TELEGRAM_LIMIT && parts.length) {
    const lowest = Math.min(...parts.map((s) => s.priority));
    parts = parts.filter((s) => s.priority !== lowest);
    out = render(parts, evidenceLines);
  }
  while (out.length > TELEGRAM_LIMIT && evidenceLines.length) {
    evidenceLines = evidenceLines.slice(0, -1);
    out = render(parts, evidenceLines);
  }
  while (out.length > TELEGRAM_LIMIT && researchLines.length) {
    researchLines = researchLines.slice(0, -1);
    out = render(parts, evidenceLines);
  }
  return out;
}

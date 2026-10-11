/** Telegram HTML event alert: one message per ticker that moved between status bands. EN and SK. */

export type AlertLocale = "en" | "sk";
export type Band = "red" | "orange" | "yellow" | "blue" | "green" | "gray";
export type ConfirmationKey = "revenue" | "eps" | "guidance" | "catalyst" | "volume" | "insider";

/** Engine state names as stored in alerts (see AlertState in the engine). */
export type StateName = "Setup met (>=18)" | "Watch" | "Wait" | "Ignore" | "Criteria broken" | "Insufficient/invalid data";

export interface StatusPoint { state: StateName; points: number | null }
export interface Coverage { known: number; total: number }

export interface EventAlertInput {
  ticker: string;
  locale: AlertLocale;
  /** Null for a first rating. */
  previous: StatusPoint | null;
  current: StatusPoint;
  /** Optional until ST1 supplies them. Absent means the line is left out, not "none". */
  confirmations?: ConfirmationKey[];
  coverage?: Coverage;
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

  if (input.confirmations?.length) lines.push(`${text.confirmations}: ${input.confirmations.map((key) => `✓ ${escapeHtml(text.chips[key])}`).join(" ")}`);
  if (input.coverage) lines.push(escapeHtml(text.coverage(input.coverage.known, input.coverage.total)));

  const site = input.site.replace(/\/+$/, "");
  const company = `${site}/${locale}/company/${encodeURIComponent(input.ticker)}`;
  const method = `${site}/${locale}/methodology`;
  lines.push(`<a href="${escapeHtml(company)}">${escapeHtml(text.open(input.ticker))}</a> · <a href="${escapeHtml(method)}">${escapeHtml(text.methodology)}</a>`);
  lines.push(escapeHtml(text.disclaimer));
  return lines.join("\n");
}

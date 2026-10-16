import type { CSSProperties } from "react";
import { RELATIVE_RULES } from "@/engine/relative";
import { fill, formatScorePercent, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { MotionRoot } from "./motion-root";
import type { KitMotion, KitState } from "./types";

/** Band cutoffs in percent of the points with data, drawn as ticks on the dial and the bar. */
export const bandTicks = [RELATIVE_RULES.waitPercent, RELATIVE_RULES.watchPercent, RELATIVE_RULES.setupPercent] as const;

export interface ScoreProps {
  /** Percent of the points with data, 0 to 100. `null` means no score (criteria broken or not enough data). */
  percent: number | null;
  /** Colours the value in the band hue. The fill never carries the state alone: pair it with a StateChip. */
  state: KitState;
  /** Localized state label, read in the accessible value text. */
  stateLabel: string;
  locale: Locale;
  /** Accessible and visible name. Defaults to "Score" / "Skóre". */
  label?: string;
  /** Settle from zero to the value: on first paint ("load") or when scrolled into view ("view"). Default "none". */
  motion?: KitMotion;
  /** Id of the disclaimer next to the score. */
  describedBy?: string;
}

function meterProps(percent: number | null, stateLabel: string, locale: Locale, label: string) {
  const t = getKitMessages(locale).score;
  if (percent === null) return { role: "img" as const, "aria-label": `${label}: ${t.noScore}, ${stateLabel}` };
  const value = clamp(percent);
  return {
    role: "meter" as const,
    "aria-label": label,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": value,
    "aria-valuetext": fill(t.valueText, { percent: formatScorePercent(locale, value), state: stateLabel }),
  };
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const toBand = (state: KitState) => (state === "pullback" ? "watch" : state);

/**
 * Horizontal score bar with tick marks at the band cutoffs (48, 60, 72%). The fill is a transform, so the settle
 * never moves layout. `role="meter"` with the percent and the state as value text.
 */
export function ScoreBar({ percent, state, stateLabel, locale, label, motion = "none", describedBy, size = "md" }: ScoreProps & { size?: "sm" | "md" }) {
  const t = getKitMessages(locale).score;
  const name = label ?? t.label;
  const value = percent === null ? null : clamp(percent);
  return (
    <MotionRoot motion={motion} className="kit-scorebar" data-state={toBand(state)} data-size={size} data-empty={value === null ? "" : undefined} style={{ "--value": value ?? 0 } as CSSProperties}>
      <span className="kit-scorebar-head" aria-hidden="true">
        <span className="kit-scorebar-name">{name}</span>
        <span className="kit-scorebar-value num">{value === null ? t.noScore : formatScorePercent(locale, value)}</span>
      </span>
      <span className="kit-scorebar-track" {...meterProps(percent, stateLabel, locale, name)} aria-describedby={describedBy}>
        <span className="kit-scorebar-fill" />
        {bandTicks.map((at) => (
          <span key={at} className="kit-scorebar-tick" data-reached={value !== null && value >= at ? "" : undefined} style={{ "--at": at } as CSSProperties} />
        ))}
      </span>
    </MotionRoot>
  );
}

// The dial: a 270 degree arc, open at the bottom like a panel gauge.
const R = 46;
const C = 60;
const START = 135;
const SWEEP = 270;
function point(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)].map((n) => Math.round(n * 100) / 100);
}
const arc = (() => {
  const [x0, y0] = point(START, R);
  const [x1, y1] = point(START + SWEEP, R);
  return `M ${x0} ${y0} A ${R} ${R} 0 1 1 ${x1} ${y1}`;
})();

/**
 * Round score dial: the arc settles from zero to the value, the percent sits in the middle on tabular figures,
 * and ticks mark the band cutoffs (longer ticks for cutoffs already reached). `null` draws a dashed empty arc.
 */
export function ScoreDial({ percent, state, stateLabel, locale, label, motion = "none", describedBy, size = "md", caption }: ScoreProps & { size?: "md" | "lg"; caption?: string }) {
  const t = getKitMessages(locale).score;
  const name = label ?? t.label;
  const value = percent === null ? null : clamp(percent);
  const text = value === null ? t.noScore : formatScorePercent(locale, value);
  const [num, unit] = splitUnit(text);
  return (
    <MotionRoot motion={motion} as="figure" className="kit-dial" data-state={toBand(state)} data-size={size} data-empty={value === null ? "" : undefined} style={{ "--value": value ?? 0 } as CSSProperties}>
      <span className="kit-dial-face" {...meterProps(percent, stateLabel, locale, name)} aria-describedby={describedBy}>
        <svg className="kit-dial-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          {[0, 25, 50, 75, 100].map((at) => {
            const deg = START + (SWEEP * at) / 100;
            const [x0, y0] = point(deg, R + 7);
            const [x1, y1] = point(deg, R + 9);
            return <line key={`m${at}`} className="kit-dial-minor" x1={x0} y1={y0} x2={x1} y2={y1} />;
          })}
          <path className="kit-dial-track" d={arc} pathLength={100} />
          {value === null ? null : <path className="kit-dial-value" d={arc} pathLength={100} />}
          {bandTicks.map((at) => {
            const deg = START + (SWEEP * at) / 100;
            const reached = value !== null && value >= at;
            const [x0, y0] = point(deg, R + 5);
            const [x1, y1] = point(deg, R + 11);
            return <line key={at} className="kit-dial-tick" data-reached={reached ? "" : undefined} x1={x0} y1={y0} x2={x1} y2={y1} />;
          })}
        </svg>
        <span className="kit-dial-readout" aria-hidden="true">
          <span className="kit-dial-num num">{num}</span>
          {unit ? <span className="kit-dial-unit">{unit}</span> : null}
        </span>
      </span>
      {caption || value !== null ? <figcaption className="kit-dial-caption">{caption ?? t.ofData}</figcaption> : null}
    </MotionRoot>
  );
}

/** "72 %" and "72%" both become ["72", "%"]; text without a number comes back whole. */
export function splitUnit(text: string): [string, string] {
  const m = text.match(/^([\d.,   ]*\d)([   ]?%)$/);
  return m ? [m[1], m[2].trim()] : [text, ""];
}

import type { CSSProperties } from "react";
import { CORE_RULES, type DisplayHit } from "@/engine/display-score";
import { fill, formatScorePercent, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { MotionRoot } from "./motion-root";
import type { KitMotion, KitState } from "./types";

export interface RuleRadarProps {
  ruleHits: readonly DisplayHit[];
  percent: number | null;
  state: KitState;
  stateLabel: string;
  locale: Locale;
  labels: Record<string, string>;
  describedBy?: string;
  caption?: string;
  motion?: KitMotion;
}

/** The same nine core rules as the table, placed at fixed bearings. The catalyst is a separate bonus. */
export function RuleRadar({ ruleHits, percent, state, stateLabel, locale, labels, describedBy, caption, motion = "none" }: RuleRadarProps) {
  const copy = getKitMessages(locale);
  const byId = new Map(ruleHits.map((hit) => [hit.id, hit]));
  const value = percent === null ? null : Math.max(0, Math.min(100, percent));
  return <MotionRoot motion={motion} className="kit-radar" data-state={state === "pullback" ? "watch" : state}>
    <div className="kit-radar-plate">
      <span className="kit-radar-ring kit-radar-ring-a" aria-hidden="true" />
      <span className="kit-radar-ring kit-radar-ring-b" aria-hidden="true" />
      <span className="kit-radar-ring kit-radar-ring-c" aria-hidden="true" />
      <span className="kit-radar-axis kit-radar-axis-x" aria-hidden="true" />
      <span className="kit-radar-axis kit-radar-axis-y" aria-hidden="true" />
      <span className="kit-radar-sweep" aria-hidden="true" />
      {CORE_RULES.map((rule, index) => {
        const hit = byId.get(rule.id);
        const result = !hit || hit.unknown ? "none" : hit.matched ? "pass" : "fail";
        const word = result === "pass" ? copy.rule.pass : result === "fail" ? copy.rule.fail : copy.rule.noData;
        const angle = (-140 + index * 40) * Math.PI / 180;
        const radius = index % 3 === 0 ? 39 : index % 3 === 1 ? 34 : 43;
        const style = { "--x": `${50 + Math.cos(angle) * radius}%`, "--y": `${50 + Math.sin(angle) * radius}%`, "--i": index } as CSSProperties;
        return <a key={rule.id} className="kit-radar-ping" data-result={result} href={`#rule-${rule.id}`} aria-label={`${labels[rule.id] ?? rule.id}: ${word}`} title={`${labels[rule.id] ?? rule.id}: ${word}`} style={style}>
          <span className="kit-radar-ping-core" aria-hidden="true">{result === "pass" ? "✓" : result === "fail" ? "×" : "–"}</span>
        </a>;
      })}
      <span className="kit-radar-centre" role={value === null ? "img" : "meter"} aria-label={value === null ? `${copy.score.label}: ${copy.score.noScore}, ${stateLabel}` : copy.score.label} aria-valuemin={value === null ? undefined : 0} aria-valuemax={value === null ? undefined : 100} aria-valuenow={value ?? undefined} aria-valuetext={value === null ? undefined : fill(copy.score.valueText, { percent: formatScorePercent(locale, value), state: stateLabel })} aria-describedby={describedBy}>
        <span className="kit-radar-value num">{value === null ? copy.score.noScore : formatScorePercent(locale, value)}</span>
        {value === null ? null : <span className="kit-radar-caption">{caption ?? copy.score.ofData}</span>}
      </span>
    </div>
  </MotionRoot>;
}

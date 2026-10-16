import type { CSSProperties, ReactNode } from "react";
import { fill, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { ResultMark } from "./kit-icons";
import { MotionRoot } from "./motion-root";
import type { KitMotion } from "./types";

export type RuleResult = "pass" | "fail" | "none";

export interface RuleRowProps {
  /** Anchor target, rendered as `id="rule-{id}"` so coverage lines can link to the row. */
  id?: string;
  name: string;
  /** Optional second line under the name: source or what is missing. */
  detail?: ReactNode;
  /** The threshold in words, for example "Growth of 20% or more year on year". Shown as "Needs". */
  needs: string;
  /** The measured value, already formatted for the locale. Omit (or null) when there is no data. */
  value?: ReactNode;
  /** "pass" (met), "fail" (not met) or "none" (no data). No data is never drawn as a miss or as 0 points. */
  result: RuleResult;
  /** Points the rule is worth. */
  max: number;
  locale: Locale;
  /** Row index inside its table, for the check-in stagger. RuleTable passes it when you map rows. */
  index?: number;
}

/**
 * One rule as a table row: name (with detail), Needs, Value, Result mark plus word, Points "+3 of 3" / "0 of 3" /
 * "No data". On narrow screens the Needs column folds under the name and the result word becomes visually hidden.
 */
export function RuleRow({ id, name, detail, needs, value, result, max, locale, index = 0 }: RuleRowProps) {
  const t = getKitMessages(locale).rule;
  const word = result === "pass" ? t.pass : result === "fail" ? t.fail : t.noData;
  const points = result === "pass" ? fill(t.pointsOf, { points: max, max }) : result === "fail" ? fill(t.pointsNone, { max }) : t.noData;
  return (
    <tr className="kit-rule" id={id ? `rule-${id}` : undefined} data-result={result} style={{ "--i": index } as CSSProperties}>
      <th scope="row" className="kit-rule-name">
        <span className="kit-rule-title">{name}</span>
        <span className="kit-rule-needs-inline" aria-hidden="true">{t.columns.needs}: {needs}</span>
        {detail ? <span className="kit-rule-detail">{detail}</span> : null}
      </th>
      <td className="kit-rule-needs">{needs}</td>
      <td className="kit-rule-value num">{value ?? <span className="kit-rule-nodata">{t.noData}</span>}</td>
      <td className="kit-rule-result">
        <span className="kit-mark" data-result={result}>
          <ResultMark result={result} />
        </span>
        <span className="kit-rule-word">{word}</span>
      </td>
      <td className="kit-rule-points num">{points}</td>
    </tr>
  );
}

export interface RuleTableProps {
  locale: Locale;
  /** Accessible name of the table, for example "Rule by rule, NVDA". */
  label: string;
  /** Visible caption; leave empty when a heading already names the table and pass `labelledBy`. */
  caption?: ReactNode;
  labelledBy?: string;
  /** Marks check in one by one: on first paint ("load"), when scrolled into view ("view"), or never ("none"). */
  motion?: KitMotion;
  /** Id of the disclaimer for the points. */
  describedBy?: string;
  children: ReactNode;
}

/** Header and body for RuleRow. Group rows can be added as `<tr className="kit-rule-group">` with one `<th colSpan={5}>`. */
export function RuleTable({ locale, label, caption, labelledBy, motion = "none", describedBy, children }: RuleTableProps) {
  const t = getKitMessages(locale).rule.columns;
  return (
    <MotionRoot motion={motion} as="table" className="kit-rules" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {caption ? <caption className="kit-rules-caption">{caption}</caption> : null}
      <thead>
        <tr>
          <th scope="col">{t.rule}</th>
          <th scope="col" className="kit-rule-needs">{t.needs}</th>
          <th scope="col" className="kit-rule-value">{t.value}</th>
          <th scope="col">{t.result}</th>
          <th scope="col" className="kit-rule-points">{t.points}</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </MotionRoot>
  );
}

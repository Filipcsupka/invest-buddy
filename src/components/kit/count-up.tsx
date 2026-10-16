import type { CSSProperties } from "react";
import { formatNumber, formatScorePercent, type Locale } from "@/i18n";
import { MotionRoot } from "./motion-root";
import type { KitMotion } from "./types";

export interface CountUpProps {
  value: number;
  locale: Locale;
  /** "number" (default) or "percent" (a 0 to 100 score percent, formatted like the rest of the site). */
  format?: "number" | "percent";
  /** "load" (default) counts on first paint; "view" when it scrolls into view; "none" never counts. */
  motion?: KitMotion;
  className?: string;
}

/**
 * A number that counts up from zero, CSS only. The final, localized text is always in the DOM and sizes the box,
 * so there is no layout shift and screen readers read the real value once. The counting copy is an aria-hidden
 * overlay driven by a registered integer property (`@property --kit-n`), right-aligned on tabular figures.
 * Only integers from 0 to 999 count: decimals and grouped thousands render still, never approximated.
 * Reduced motion and browsers without `@property` show the final value.
 */
export function CountUp({ value, locale, format = "number", motion = "load", className }: CountUpProps) {
  const text = format === "percent" ? formatScorePercent(locale, value) : formatNumber(locale, value);
  const countable = Number.isInteger(value) && value >= 0 && value <= 999 && motion !== "none";
  const suffix = countable ? text.slice(String(value).length) : "";
  const cls = className ? `kit-count ${className}` : "kit-count";
  if (!countable || !text.startsWith(String(value))) return <span className={cls}><span className="kit-count-final">{text}</span></span>;
  return (
    <MotionRoot motion={motion} as="span" className={cls} style={{ "--to": value } as CSSProperties}>
      <span className="kit-count-final">{text}</span>
      <span className="kit-count-live" aria-hidden="true">
        <span className="kit-count-n" />
        {suffix}
      </span>
    </MotionRoot>
  );
}

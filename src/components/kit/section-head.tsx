import type { ReactNode } from "react";

export interface SectionHeadProps {
  title: ReactNode;
  /** Heading level. h2 by default; never skip a level (the a11y test checks every page). */
  as?: "h2" | "h3";
  id?: string;
  /** One sentence under the title, at most 60ch. No eyebrow or kicker above the title, ever. */
  lede?: ReactNode;
  /** Right column, aligned to the title baseline: a date, a stamp, a TierBadge, a link. */
  meta?: ReactNode;
  /** "ink" (default) draws the full ink rule of a ledger row; "quiet" uses the hairline. */
  rule?: "ink" | "quiet";
}

/** Section head of the datasheet: a rule above, the title on the left, meta on the right. */
export function SectionHead({ title, as: Tag = "h2", id, lede, meta, rule = "ink" }: SectionHeadProps) {
  return (
    <div className="kit-section-head" data-rule={rule} data-level={Tag}>
      <div className="kit-section-main">
        <Tag id={id} className="kit-section-title">
          {title}
        </Tag>
        {lede ? <p className="kit-section-lede">{lede}</p> : null}
      </div>
      {meta ? <div className="kit-section-meta">{meta}</div> : null}
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight } from "../icons";
import { IconLock } from "./kit-icons";
import type { Tier } from "./types";

/**
 * "Free" or "Paid" stamp. Paid is a solid mulberry stamp with a padlock; Free is a neutral outline.
 * The word is always printed, so the tier never rests on colour.
 */
export function TierBadge({ tier, label }: { tier: Tier; label: string }) {
  return (
    <span className="kit-tier" data-tier={tier}>
      {tier === "paid" ? <IconLock /> : null}
      <span>{label}</span>
    </span>
  );
}

/**
 * A paid section as the admin view shows it: a hairline mulberry frame with the Paid stamp set into its top edge,
 * like a revision tag on a drawing. Set `--frame-bg` on the parent when the section sits on `--sheet`.
 */
export function TierFrame({ tier = "paid", badgeLabel, note, children, className }: { tier?: Tier; badgeLabel: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `kit-tierframe ${className}` : "kit-tierframe"} data-tier={tier}>
      <p className="kit-tierframe-tag">
        <TierBadge tier={tier} label={badgeLabel} />
        {note ? <span className="kit-tierframe-note">{note}</span> : null}
      </p>
      {children}
    </div>
  );
}

export interface LockCardProps {
  /** For example "Part of the Paid tier". */
  title: string;
  /** Lead-in for the list, for example "Behind this card". */
  behindLabel: string;
  /** What the section holds, in plain words. Three items at most. */
  items: string[];
  /** The status (chip, score) of the thing behind the card. Always rendered first: a lock never hides the status. */
  status?: ReactNode;
  /** Line under the status, for example "The status stays visible on every tier." */
  statusNote?: string;
  badgeLabel: string;
  /** Optional link to the plans page. No prices, no urgency. */
  action?: { href: string; label: string };
}

/**
 * Stand-in for a paid section, for a future free viewer. It names what is behind it and keeps the status in view.
 * Not a dialog, not a blur over real content: the paid content is not in the page at all.
 */
export function LockCard({ title, behindLabel, items, status, statusNote, badgeLabel, action }: LockCardProps) {
  return (
    <aside className="kit-lock" aria-label={title}>
      {status ? (
        <div className="kit-lock-status">
          {status}
          {statusNote ? <p className="kit-lock-status-note">{statusNote}</p> : null}
        </div>
      ) : null}
      <div className="kit-lock-body">
        <p className="kit-lock-title">
          <IconLock />
          <span>{title}</span>
          <TierBadge tier="paid" label={badgeLabel} />
        </p>
        <p className="kit-lock-behind">{behindLabel}</p>
        <ul className="kit-lock-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {action ? (
          <Link className="arrow-link kit-lock-action" href={action.href}>
            {action.label}
            <IconArrowRight />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Slim banner under the header that explains the admin view. `mode` comes from the tier logic (not built yet);
 * "hidden" renders nothing, which is the default for every visitor today.
 */
export function TierBanner({ mode = "hidden", title, note, badgeLabel }: { mode?: "hidden" | "admin"; title: string; note: string; badgeLabel: string }) {
  if (mode === "hidden") return null;
  return (
    <div className="kit-tier-banner" role="note" data-mode={mode}>
      <div className="frame kit-tier-banner-inner">
        <TierBadge tier="paid" label={badgeLabel} />
        <p>
          <strong>{title}</strong> <span className="kit-tier-banner-note">{note}</span>
        </p>
      </div>
    </div>
  );
}

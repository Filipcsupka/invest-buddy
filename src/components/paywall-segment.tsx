import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { TIER_LIMITS, TIERS } from "@/config/tiers";
import { getTierMessages, limitNote, lockBody } from "@/i18n/tier-messages";
import type { Locale } from "@/i18n";
import type { PaywallSegmentId } from "../paywall/segments";
import { baseViewer, type Viewer } from "@/viewer/viewer";
import { TierBadge, TierLock, TierNote } from "./tier-lock";

// Not `data-tier`: the wording gate tests ban that attribute name (it is also used for action size tiers).
type Marked = { "data-paywall-candidate"?: string; "data-segment-tier"?: string };

/**
 * Marks a page segment and applies its tier (src/config/tiers.ts).
 * - admin: the children plus a "Paid" badge before them on paid and depth-limited segments.
 * - free viewer, lock segment: a lock card; the children are not rendered, so their text is not in the HTML.
 * - free viewer, limit segment: the children (the page already loaded the limited data) plus a depth note.
 * - paid viewer or a free segment: the children with the marker only.
 *
 * Synchronous on purpose, so pages stay renderable in tests. Pass `viewer` from `await getViewer()` to honour `?view=free`;
 * without it the viewer comes from the flags alone (admin while AUTH is off). Pass `locale` for lock and badge text.
 * `detail` is an optional extra line on a lock card, such as a count.
 */
export function PaywallSegment({ id, children, viewer, locale = "en", detail }: { id: PaywallSegmentId; children: ReactNode; viewer?: Viewer; locale?: Locale; detail?: string }) {
  const entry = TIERS[id];
  const who = viewer ?? baseViewer();
  const m = getTierMessages(locale);
  const gated = entry.tier === "paid" && who.tier === "free";

  if (gated && entry.mode === "lock") return <TierLock segmentId={id} label={m.lockTitle} body={lockBody(locale, id, detail)} />;

  const marker: Marked = { "data-paywall-candidate": id };
  if (entry.tier === "paid" && who.tier === "admin") marker["data-segment-tier"] = "paid";
  const content = isValidElement(children)
    ? cloneElement(children as ReactElement<Marked>, marker)
    : <div {...marker}>{children}</div>;

  if (entry.tier === "paid" && who.tier === "admin") return <><TierBadge segmentId={id} label={m.badge} title={m.badgeHint} />{content}</>;
  if (gated && entry.mode === "limit") {
    const note = limitNote(locale, id, TIER_LIMITS.free[entry.limit]);
    return <>{content}{note && <TierNote segmentId={id} text={note} />}</>;
  }
  return content;
}

import type { ReactNode } from "react";
import { LockCard, TierFrame } from "@/components/kit";
import { TIER_LIMITS } from "@/config/tiers";
import { fill, plural, type Locale } from "@/i18n";
import { getCompanyMessages } from "@/i18n/company-messages";
import { getKitMessages } from "@/i18n/kit-messages";
import { getTierMessages } from "@/i18n/tier-messages";
import { canSee, type Viewer } from "@/viewer/viewer";

type PaidId = "score-history" | "idea-card";

/** What a PaywallSegment inside a frame should treat as its viewer: the frame already shows the Paid mark. */
const framed: Viewer = { tier: "paid", preview: false };

/**
 * Kit presentation of a paid company section. The tier decision stays in src/config/tiers.ts and PaywallSegment:
 * - admin: the section inside a TierFrame with the Paid stamp; the segment inside renders as for a paid viewer, so the badge is not drawn twice.
 * - free viewer on a locked segment: a LockCard with the status first; the paid content is not rendered.
 * - free viewer on a limited segment, or a paid viewer: the segment as PaywallSegment renders it (content plus depth note).
 */
export function PaidPart({ id, viewer, locale, status, children }: { id: PaidId; viewer: Viewer; locale: Locale; status?: ReactNode; children: (viewer: Viewer) => ReactNode }) {
  const kit = getKitMessages(locale);
  const tier = getTierMessages(locale);
  if (!canSee(viewer, id)) {
    return (
      <div className="co-lock" data-paywall-candidate={id} data-tier-lock={id}>
        <LockCard title={tier.lockTitle} behindLabel={kit.lock.behind} items={[tier.teaser[id] ?? ""].filter(Boolean)} status={status} statusNote={tier.lockSuffix} badgeLabel={tier.badge} />
      </div>
    );
  }
  if (viewer.tier === "admin") {
    const days = TIER_LIMITS.free.scoreHistoryDays;
    const note = fill(getCompanyMessages(locale).paidNote[id], { days: days === null ? "" : plural(locale, tier.days, days) });
    return (
      <div className="co-paid" data-tier-badge={id}>
        <TierFrame badgeLabel={tier.badge} note={note}>{children(framed)}</TierFrame>
      </div>
    );
  }
  return <>{children(viewer)}</>;
}

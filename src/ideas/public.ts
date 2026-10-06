import type { SizeTier, StoredIdea } from "../db/ideas";

/** Actions that get a card on the company page. HOLD, CSPX_ALLOCATION and anything else stay hidden. */
export const COMPANY_CARD_ACTIONS = ["WATCH", "START_POSITION", "ADD", "HIGH_CONVICTION_ADD", "REDUCE", "THESIS_BROKEN"] as const;
export const showsOnCompanyPage = (idea: Pick<StoredIdea, "action">) => (COMPANY_CARD_ACTIONS as readonly string[]).includes(idea.action);

/** The public size of an idea: its tier, or null for an idea stored before tiers existed. NONE means no new money. */
export const publicTier = (idea: Pick<StoredIdea, "sizeTier">): SizeTier | null => idea.sizeTier ?? null;
/** True when the tier names a buy size worth putting in the headline. */
export const hasBuySize = (tier: SizeTier | null): tier is Exclude<SizeTier, "NONE"> => tier !== null && tier !== "NONE";

const EUR = /€|\beur(?:o|os)?\b|\d\s*eur\b|\beur\s*\d/i;
export const mentionsEur = (text: string) => EUR.test(text);

/** Drops every sentence that names a EUR amount. Returns null when nothing is left. */
export function withoutEur(text: string): string | null {
  const kept = text.split(/(?<=[.!?])\s+/).filter((s) => !EUR.test(s));
  const out = kept.join(" ").trim();
  return out || null;
}
const cleanList = (items: string[]) => items.map(withoutEur).filter((t): t is string => t !== null);

/**
 * ADR-001: the public page shows no money. Removes the owner's EUR band, plan.amountNow and every sentence or line that names a EUR amount.
 * The size tier stays: it is a share of a full position in the reader's own portfolio, not an amount.
 * Fields the schema requires may come back empty; the card then leaves the block out.
 */
export function stripEur(idea: StoredIdea): StoredIdea {
  return {
    ...idea,
    amountMinEur: 0,
    amountMaxEur: 0,
    verdict: withoutEur(idea.verdict) ?? "",
    whatHappened: cleanList(idea.whatHappened),
    whyItMatters: cleanList(idea.whyItMatters),
    numbers: idea.numbers.filter((n) => !EUR.test(n.label) && !EUR.test(n.value)),
    plan: {
      amountNow: "",
      trigger: withoutEur(idea.plan.trigger) ?? "",
      invalidation: withoutEur(idea.plan.invalidation) ?? "",
      opportunityCost: withoutEur(idea.plan.opportunityCost) ?? "",
    },
    evidence: idea.evidence.filter((e) => !EUR.test(e.label)),
    conflictNote: idea.conflictNote ? withoutEur(idea.conflictNote) : null,
  };
}

/** Owner allocation placeholders. The owner must confirm every value and the broker fee before use. */
export const ALLOCATION_CONFIG = {
  // Owner example: a starter is about one fifth of free cash, or EUR 40 on EUR 200.
  starterPercent: 20,
  // Owner example: a usual starter is at least EUR 40.
  starterFloorEur: 40,
  // Owner example: a usual starter is at most EUR 70.
  starterCeilingEur: 70,
  // Draft step between a starter and a full new position; owner has not signed off.
  standardPercent: 30,
  // Draft lower bound for a standard order; owner has not signed off.
  standardFloorEur: 60,
  // Draft absolute ceiling for a standard order; owner has not signed off.
  standardCeilingEur: 140,
  // Draft full-position share of free cash; owner has not signed off.
  fullPercent: 40,
  // Draft lower bound for a full order; owner has not signed off.
  fullFloorEur: 80,
  // Draft absolute ceiling for a full order; owner has not signed off.
  fullCeilingEur: 200,
  // Draft ordinary add share, between starter and high-conviction add; owner has not signed off.
  addPercent: 30,
  // Draft lower bound for an add; owner has not signed off.
  addFloorEur: 40,
  // Draft absolute ceiling for an add; owner has not signed off.
  addCeilingEur: 150,
  // Owner's mega-news example allows a larger share only for HIGH_CONVICTION_ADD.
  highConvictionAddPercent: 50,
  // Draft minimum for a high-conviction add; owner has not signed off.
  highConvictionAddFloorEur: 60,
  // Draft absolute ceiling for a high-conviction add; owner has not signed off.
  highConvictionAddCeilingEur: 300,
  // Draft maximum share of free cash for any ordinary order; owner has not signed off.
  ordinaryOrderCashCeilingPercent: 40,
  // Owner's mega-news example: a high-conviction add may reach half of free cash.
  highConvictionOrderCashCeilingPercent: 50,
  // Draft reserve of about one third of each monthly contribution for follow-on adds.
  addReservePercentOfContribution: 33.333333,
  // Owner's cash-drag guard starts above three monthly contributions; it is a note only.
  cashDragMonths: 3,
  // Draft minimum order, pending the owner's IBKR order-size preference.
  minimumOrderEur: 20,
  // Draft estimated IBKR fee, not a broker quote; owner must replace it for the account.
  estimatedFeeEur: 0.35,
  // Draft maximum fee burden: a EUR 0.35 fee on EUR 40 is below one percent.
  maxFeePercent: 1,
} as const;

/** Revenue concepts in priority order. A filer uses the first one with enough quarters. */
export const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
] as const;

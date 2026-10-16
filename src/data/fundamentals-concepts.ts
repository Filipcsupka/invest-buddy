import { REVENUE_CONCEPTS } from "../collectors/sources/frames";

/** Interest expense, in the order the interest cover flag prefers them. Companies tag it differently; the first one with an annual fact for the period wins. */
export const INTEREST_EXPENSE_CONCEPTS = ["InterestExpense", "InterestExpenseNonoperating", "InterestAndDebtExpense"] as const;

export const FUNDAMENTALS_CONCEPTS = {
  "us-gaap": new Set<string>([
    ...REVENUE_CONCEPTS,
    "GrossProfit", "OperatingIncomeLoss", "NetIncomeLoss", "EarningsPerShareDiluted",
    "NetCashProvidedByOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
    "ResearchAndDevelopmentExpense",
    ...INTEREST_EXPENSE_CONCEPTS,
  ]),
  dei: new Set<string>(["EntityCommonStockSharesOutstanding"]),
};

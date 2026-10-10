import { REVENUE_CONCEPTS } from "../collectors/sources/frames";

export const FUNDAMENTALS_CONCEPTS = {
  "us-gaap": new Set<string>([
    ...REVENUE_CONCEPTS,
    "GrossProfit", "OperatingIncomeLoss", "NetIncomeLoss", "EarningsPerShareDiluted",
    "NetCashProvidedByOperatingActivities", "PaymentsToAcquirePropertyPlantAndEquipment",
    "ResearchAndDevelopmentExpense",
  ]),
  dei: new Set<string>(["EntityCommonStockSharesOutstanding"]),
};

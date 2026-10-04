/** Rule ids, weights and groups as published in the methodology. Kept dependency-free so client components can import it. */
export type StateKey = "setup" | "watch" | "wait" | "ignore" | "broken" | "insufficient";
export const stateOrder: StateKey[] = ["setup", "watch", "wait", "ignore", "broken", "insufficient"];

export type RuleId = "revenue-acceleration" | "earnings" | "catalyst" | "accumulation" | "above-ma" | "uptrend" | "green-volume" | "dip" | "rotation" | "macro-data";
export type GroupId = "fundamentals" | "technical" | "macro";

export const ruleGroups: { group: GroupId; max: number; rules: { id: RuleId; points: number }[] }[] = [
  { group: "fundamentals", max: 10, rules: [{ id: "revenue-acceleration", points: 4 }, { id: "earnings", points: 3 }, { id: "catalyst", points: 2 }, { id: "accumulation", points: 1 }] },
  { group: "technical", max: 10, rules: [{ id: "above-ma", points: 3 }, { id: "uptrend", points: 3 }, { id: "green-volume", points: 2 }, { id: "dip", points: 2 }] },
  { group: "macro", max: 5, rules: [{ id: "rotation", points: 2 }, { id: "macro-data", points: 3 }] },
];

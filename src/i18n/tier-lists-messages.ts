import { fill, type Locale } from "./index";

/** Copy for the scanner, insiders and ideas tier segments. Kept apart from messages.ts and tier-messages.ts so parallel branches do not collide. */
const en = {
  streakNote: "The rules-met column also shows how many days each ticker has met its rules, and how many rules were gained or lost this week.",
  changePresetLock: "In the paid tier",
  ideasCount: "{n} ideas are listed.",
};

const sk: typeof en = {
  streakNote: "Stĺpec splnených pravidiel ukazuje aj to, koľko dní každý titul spĺňa svoje pravidlá a koľko pravidiel za týždeň pribudlo alebo ubudlo.",
  changePresetLock: "V platenej úrovni",
  ideasCount: "Počet nápadov v zozname: {n}.",
};

export type TierListsMessages = typeof en;
const catalog: Record<Locale, TierListsMessages> = { en, sk };
export const getTierListsMessages = (locale: Locale): TierListsMessages => catalog[locale];
export const ideasCountText = (locale: Locale, n: number): string => fill(catalog[locale].ideasCount, { n });

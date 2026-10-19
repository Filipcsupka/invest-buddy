import type { Locale } from "./index";

/** Copy for the company page calendar. Kept apart from messages.ts so parallel branches do not collide. Dates only, no action wording (docs/wording-gate.md). */
const en = {
  title: "Upcoming dates",
  note: "Scheduled dates only. Scores do not change because of them.",
  earnings: "Earnings report",
  timeOfDay: { "pre-market": "before the market opens", "post-market": "after the market closes" },
  today: "today",
  tomorrow: "tomorrow",
  inDays: "in {n} days",
  /** Two to four days; Slovak uses a different plural there. */
  inDaysFew: "in {n} days",
  macroSource: "Release dates: US Bureau of Labor Statistics and Federal Reserve schedules.",
  earningsSource: "Earnings date: Alpha Vantage earnings calendar.",
};

const sk: typeof en = {
  title: "Nadchádzajúce termíny",
  note: "Iba plánované termíny. Skóre sa nimi nemení.",
  earnings: "Zverejnenie výsledkov",
  timeOfDay: { "pre-market": "pred otvorením trhu", "post-market": "po zatvorení trhu" },
  today: "dnes",
  tomorrow: "zajtra",
  inDays: "o {n} dní",
  inDaysFew: "o {n} dni",
  macroSource: "Termíny správ: harmonogramy amerického Úradu pre štatistiku práce (BLS) a Federálneho rezervného systému.",
  earningsSource: "Termín výsledkov: kalendár výsledkov Alpha Vantage.",
};

export function getCatalystCalendarMessages(locale: Locale): typeof en {
  return locale === "sk" ? sk : en;
}

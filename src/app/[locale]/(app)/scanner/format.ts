import { fill, getMessages, type Locale } from "@/i18n";
import type { RuleStreak } from "@/db/rules-streak";

type Scanner = ReturnType<typeof getMessages>["scanner"];

/** English has one and many; Slovak has one (1), few (2 to 4) and many. */
function form(locale: Locale, n: number): "One" | "Few" | "Many" {
  if (n === 1) return "One";
  return locale === "sk" && n >= 2 && n <= 4 ? "Few" : "Many";
}

export function dayLabel(locale: Locale, n: number): string {
  const s = getMessages(locale).scanner;
  return fill(s[`day${form(locale, n)}` as "dayOne"], { n });
}

export function ruleCountLabel(locale: Locale, count: number): string {
  const s = getMessages(locale).scanner;
  return fill(s[`ruleCount${form(locale, count)}` as "ruleCountOne"], { count });
}

/** "unchanged for 12 days", "unchanged for at least 90 days" or "changed today". */
export function streakText(locale: Locale, streak: Pick<RuleStreak, "sinceDays" | "atLeast">): string {
  const s: Scanner = getMessages(locale).scanner;
  if (streak.sinceDays === 0) return streak.atLeast ? fill(s.streakSinceAtLeast, { days: dayLabel(locale, 0) }) : s.streakToday;
  return fill(streak.atLeast ? s.streakSinceAtLeast : s.streakSince, { days: dayLabel(locale, streak.sinceDays) });
}

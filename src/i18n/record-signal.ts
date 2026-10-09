import { getMessages, type Locale } from "./index";

const scoreStates = {
  "Setup met (>=18)": "setup",
  Watch: "watch",
  Wait: "wait",
  Ignore: "ignore",
  "Criteria broken": "broken",
  "Insufficient/invalid data": "insufficient",
} as const;

/** Stored record codes are localized at the display edge. */
export function recordSignalLabel(locale: Locale, signal: { tier: string; state: string }): string {
  const m = getMessages(locale);
  const tier = m.trackRecord.signalTiers[signal.tier as keyof typeof m.trackRecord.signalTiers] ?? signal.tier;
  const state = m.states[scoreStates[signal.state as keyof typeof scoreStates]]
    ?? m.ideas.actions[signal.state as keyof typeof m.ideas.actions]
    ?? signal.state;
  // These tiers already say what the state says ("Add 1/3" for ADD, "Criteria broken" for the broken state); do not repeat it.
  const repeats = (signal.tier === "BROKEN" && signal.state === "Criteria broken") || (signal.tier.startsWith("ADD_") && signal.state === "ADD");
  return repeats ? tier : `${tier} · ${state}`;
}

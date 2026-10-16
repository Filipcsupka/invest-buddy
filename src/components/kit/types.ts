import type { StateKey } from "@/i18n/rules";

/** The six engine states plus Pullback in uptrend, which the engine reports as a Watch qualifier. */
export type KitState = StateKey | "pullback";

/** Display order, highest step first, the same order as the scanner groups. */
export const kitStates: readonly KitState[] = ["setup", "watch", "pullback", "wait", "ignore", "broken", "insufficient"];

/**
 * How a kit component moves.
 * - "none": static (the default; a page gets one authored moment, not motion everywhere).
 * - "load": plays once on first paint, CSS only, no JavaScript.
 * - "view": plays once when it scrolls into view. Needs the small Motion island; already-visible content stays still.
 * Reduced motion always shows the final state.
 */
export type KitMotion = "none" | "load" | "view";

export type Tier = "free" | "paid";

/** Engine state from a display state plus the pullback qualifier. */
export function kitState(state: StateKey, pullback = false): KitState {
  return state === "watch" && pullback ? "pullback" : state;
}

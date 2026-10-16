import { StateIcon } from "./kit-icons";
import type { KitState } from "./types";

export interface StateChipProps {
  /** One of the seven states. Use `kitState(state, pullback)` to fold the pullback qualifier in. */
  state: KitState;
  /** Localized label, for example `m.status.labels.watch` or `m.states.pullback`. Always printed. */
  label: string;
  /** "sm" for table rows and the strip, "md" (default) for headers, "lg" for a page's status line. */
  size?: "sm" | "md" | "lg";
  /** Id of the disclaimer this state is read with (ADR-001: a disclaimer sits beside every score). */
  describedBy?: string;
  /** Show only the shape. The label stays as visually hidden text, so the chip is never colour alone. */
  iconOnly?: boolean;
}

/**
 * Rule-state chip. Three channels carry the state: the label, a shape per state (octagon, circle with a minus,
 * hourglass, eye, dip, circle with a check, dashed circle) and the band colour from `--st-*` on its own wash.
 * Insufficient data draws a dashed construction line. Every text pair is AA in both themes.
 */
export function StateChip({ state, label, size = "md", describedBy, iconOnly = false }: StateChipProps) {
  return (
    <span className="kit-chip" data-state={state} data-size={size} data-icon-only={iconOnly ? "" : undefined} aria-describedby={describedBy} title={iconOnly ? label : undefined}>
      <StateIcon state={state} />
      <span className={iconOnly ? "visually-hidden" : "kit-chip-label"}>{label}</span>
    </span>
  );
}

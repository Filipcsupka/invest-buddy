import type { StateKey } from "@/i18n/rules";
import { IconDip } from "./icons";

/**
 * Rule-state chip. One signal colour carries the state: solid for Setup met,
 * outlined for Watch, neutral rules for Wait and Ignore, section hatching for
 * Criteria broken, a dashed construction line for Insufficient data.
 */
export function StateChip({ state, label, pullbackLabel, describedBy }: { state: StateKey; label: string; pullbackLabel?: string | null; describedBy?: string }) {
  return (
    <span className="state" aria-describedby={describedBy}>
      <span className="chip" data-state={state}>
        {label}
      </span>
      {pullbackLabel ? (
        <span className="qualifier">
          <IconDip />
          {pullbackLabel}
        </span>
      ) : null}
    </span>
  );
}

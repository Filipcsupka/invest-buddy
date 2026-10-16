import type { StateKey } from "@/i18n/rules";
import { StateChip as KitStateChip } from "./kit/state-chip";

/**
 * Rule-state chip on the kit StateChip. A Watch row with the pullback qualifier shows the kit's Pullback chip beside
 * the Watch chip, so the qualifier has its own shape and is not read from colour.
 */
export function StateChip({ state, label, pullbackLabel, describedBy }: { state: StateKey; label: string; pullbackLabel?: string | null; describedBy?: string }) {
  return (
    <span className="state">
      <KitStateChip state={state} label={label} size="lg" describedBy={describedBy} />
      {pullbackLabel ? <KitStateChip state="pullback" label={pullbackLabel} size="sm" /> : null}
    </span>
  );
}

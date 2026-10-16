import type { Viewer } from "@/viewer/viewer";
import type { ScannerFilters } from "./filters";
import type { PresetId } from "./presets";

/** Presets that need the stored rules streak. Paid (segment scanner-streak). */
export const CHANGE_PRESETS: readonly PresetId[] = ["newly-meeting", "rules-lost"];
export const isChangePreset = (id: string): boolean => (CHANGE_PRESETS as readonly string[]).includes(id);

/**
 * Free viewers keep search, state, sector, the floor toggle, the default sort and the rule presets.
 * Score range, F/T/M minimums, source, held, sort and the change presets are paid, so a free URL that carries them is reduced to the free filters.
 */
export function limitFiltersFor(viewer: Viewer, filters: ScannerFilters): ScannerFilters {
  if (viewer.tier !== "free") return filters;
  return {
    ...filters, min: null, max: null, f: null, t: null, m: null, held: false, source: "", sort: "score",
    preset: filters.preset && isChangePreset(filters.preset) ? "" : filters.preset,
  };
}

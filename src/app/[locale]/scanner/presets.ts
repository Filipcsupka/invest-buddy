import type { RuleId } from "@/i18n/rules";
import { ruleGroups } from "@/i18n/rules";
import type { RuleStreak } from "@/db/rules-streak";
import type { PublicHorizon } from "@/data/public-horizons";

/**
 * Named screens defined as rule sets. A preset is a filter over published rules, not a list of names to act on
 * (ADR-001). Rule presets match when every listed rule is met today. Change presets match when any rule was gained
 * or lost over the last week. Names are in `messages.scanner.presets`.
 */
export type PresetId = "growth-earnings" | "trend-volume" | "pullback-uptrend" | "holders-catalyst" | "macro-tailwind" | "newly-meeting" | "rules-lost" | "sustained-growers" | "event-driven";
export type Preset = { id: PresetId; kind: "rules"; rules: readonly RuleId[] } | { id: PresetId; kind: "gained" | "lost"; rules: readonly RuleId[] } | { id: PresetId; kind: "profile"; profile: PublicHorizon["profile"]; rules: readonly RuleId[] };

const allRules = ruleGroups.flatMap((group) => group.rules.map((rule) => rule.id));

export const presets: readonly Preset[] = [
  { id: "growth-earnings", kind: "rules", rules: ["revenue-acceleration", "earnings"] },
  { id: "trend-volume", kind: "rules", rules: ["above-ma", "uptrend", "green-volume"] },
  { id: "pullback-uptrend", kind: "rules", rules: ["uptrend", "dip"] },
  { id: "holders-catalyst", kind: "rules", rules: ["accumulation", "catalyst"] },
  { id: "macro-tailwind", kind: "rules", rules: ["rotation", "macro-data"] },
  { id: "newly-meeting", kind: "gained", rules: allRules },
  { id: "rules-lost", kind: "lost", rules: allRules },
  { id: "sustained-growers", kind: "profile", profile: "sustained", rules: [] },
  { id: "event-driven", kind: "profile", profile: "event_driven", rules: [] },
];

export const presetIds: readonly PresetId[] = presets.map((preset) => preset.id);
export const presetById = (id: string): Preset | undefined => presets.find((preset) => preset.id === id);

type Hit = { id: string; matched: boolean; unknown?: boolean };

/** True when the ticker fits the preset. Change presets need streak data and match nothing without it. */
export function matchesPreset(preset: Preset, hits: readonly Hit[], streak: RuleStreak | undefined, horizon?: PublicHorizon): boolean {
  if (preset.kind === "rules") return preset.rules.every((id) => hits.some((hit) => hit.id === id && hit.matched && !hit.unknown));
  if (preset.kind === "profile") return horizon?.profile === preset.profile;
  return Boolean(streak && (preset.kind === "gained" ? streak.gained : streak.lost).length);
}

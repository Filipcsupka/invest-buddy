import { ruleGroups, type RuleId, type StateKey } from "@/i18n/rules";

/**
 * The rule strip: ten blocks, each as wide as its rule's points, grouped
 * 10 | 10 | 5. A met rule is filled. Under a rejection rule the met blocks
 * are hatched, because the points no longer count.
 */
export function ScoreMark({
  matched,
  state,
  label,
  size = "sm",
  groupLabels,
  unknown,
}: {
  matched: readonly string[] | null;
  state: StateKey;
  label: string;
  size?: "sm" | "lg";
  groupLabels?: { short: string; name: string; score: number; note?: string }[];
  /** Rule ids with no data: drawn dashed and hatched, never as not met. */
  unknown?: readonly string[];
}) {
  const met = new Set<string>(matched ?? []);
  const gone = new Set<string>(unknown ?? []);
  return (
    <span className={`mark mark-${size}`} data-state={state} role="img" aria-label={label}>
      {ruleGroups.map((group, index) => (
        <span className="mark-group" key={group.group} style={{ flexGrow: group.max }}>
          <span className="mark-blocks">
            {group.rules.map((rule: { id: RuleId; points: number }) => (
              <span key={rule.id} className={met.has(rule.id) ? "mark-block is-met" : gone.has(rule.id) ? "mark-block is-unknown" : "mark-block"} style={{ flexGrow: rule.points }} />
            ))}
          </span>
          {size === "lg" && groupLabels ? (
            <span className="mark-caption">
              <abbr title={groupLabels[index].name}>{groupLabels[index].short}</abbr>
              <span className="num">
                {groupLabels[index].score}/{group.max}{groupLabels[index].note ? `, ${groupLabels[index].note}` : ""}
              </span>
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

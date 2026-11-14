import { etfScoreCoverage, etfScoreStatus, type EtfScoreResult } from "@/engine/etf-score";
import type { EtfMessages } from "@/i18n/etf-messages";

export function EtfStoredScore({ score, m, compact = false }: { score: EtfScoreResult | null | undefined; m: EtfMessages; compact?: boolean }) {
  if (!score) return <span>{m.scorePending}</span>;
  const { groupsWithData, gaps } = etfScoreCoverage(score.rules);
  const status = etfScoreStatus(score);
  const isSlovak = m.scoreTitle === "Hodnotenie ETF";
  const bandLabels = isSlovak
    ? { mostlyMet: "Väčšinou spĺňa", partlyMet: "Čiastočne spĺňa", fewMet: "Spĺňa málo pravidiel" }
    : { mostlyMet: "Mostly met", partlyMet: "Partly met", fewMet: "Few met" };
  const statusLabel = status in bandLabels ? bandLabels[status as keyof typeof bandLabels] : m.scoreStates[status as keyof typeof m.scoreStates];
  return <div>
    <p>{score.percent === null ? statusLabel : `${score.percent}% · ${statusLabel}`}</p>
    <p>{m.scoreGroups.replace("{count}", String(groupsWithData)).replace(/4(?= groups| skupín)/, "8")}</p>
    {score.incompleteData || score.evidencedMax < 70 ? <p>{isSlovak ? "Neúplné údaje" : "Incomplete data"}</p> : null}
    {!compact ? <p>{m.scoreLine.replace("{earned}", String(score.earned)).replace("{max}", String(score.evidencedMax))}</p> : null}
    {gaps.length ? <p>{m.scoreMissing}: {gaps.map((gap) => m.scoreGaps[gap]).join(", ")}</p> : null}
    {score.rules.some((rule) => rule.id === "replication" && rule.evidenced) ? <p>{m.scoreReplicationSource}</p> : null}
    {!compact && score.concentration?.concentrated ? <p>{m.scoreConcentrated}</p> : null}
  </div>;
}

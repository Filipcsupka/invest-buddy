import { etfScoreCoverage, etfScoreStatus, type EtfScoreResult } from "@/engine/etf-score";
import type { EtfMessages } from "@/i18n/etf-messages";

export function EtfStoredScore({ score, m, compact = false }: { score: EtfScoreResult | null | undefined; m: EtfMessages; compact?: boolean }) {
  if (!score) return <span>{m.scorePending}</span>;
  const { groupsWithData, gaps } = etfScoreCoverage(score.rules);
  const status = etfScoreStatus(score);
  return <div>
    <p>{score.percent === null ? m.scoreStates[status] : `${score.percent}% · ${m.scoreStates[status]}`}</p>
    <p>{m.scoreGroups.replace("{count}", String(groupsWithData))}</p>
    {!compact ? <p>{m.scoreLine.replace("{earned}", String(score.earned)).replace("{max}", String(score.evidencedMax))}</p> : null}
    {gaps.length ? <p>{m.scoreMissing}: {gaps.map((gap) => m.scoreGaps[gap]).join(", ")}</p> : null}
    {score.rules.some((rule) => rule.id === "replication" && rule.evidenced) ? <p>{m.scoreReplicationSource}</p> : null}
    {!compact && score.concentration?.concentrated ? <p>{m.scoreConcentrated}</p> : null}
  </div>;
}

import { etfScoreCoverage, etfScoreStatus, type EtfScoreResult } from "@/engine/etf-score";
import type { EtfMessages } from "@/i18n/etf-messages";

export function EtfStoredScore({ score, m, compact = false }: { score: EtfScoreResult | null | undefined; m: EtfMessages; compact?: boolean }) {
  if (!score) return <span>{m.scorePending}</span>;
  const { groupsWithData, gaps } = etfScoreCoverage(score.rules);
  const status = etfScoreStatus(score);
  const statusLabel = m.scoreStates[status];
  const legacy = score.rulesVersion?.startsWith("etf-v2-") ?? false;
  const applicableGroups = legacy ? 4 : score.rules.some((rule) => rule.group === "income") ? 8 : 7;
  return <div>
    <p>{score.percent === null ? statusLabel : `${score.percent}% · ${statusLabel}`}</p>
    <p>{m.scoreGroups.replace("{count}", String(groupsWithData)).replace("{total}", String(applicableGroups))}</p>
    {!legacy && score.incompleteData ? <p>{m.scoreIncomplete}</p> : null}
    {legacy ? <p>{m.scoreLegacy}</p> : null}
    {!compact ? <p>{m.scoreLine.replace("{earned}", String(score.earned)).replace("{max}", String(score.evidencedMax))}</p> : null}
    {gaps.length ? <p>{m.scoreMissing}: {gaps.map((gap) => m.scoreGaps[gap]).join(", ")}</p> : null}
    {score.rules.some((rule) => rule.id === "replication" && rule.evidenced) ? <p>{m.scoreReplicationSource}</p> : null}
    {!compact && score.concentration?.concentrated ? <p>{m.scoreConcentrated}</p> : null}
  </div>;
}

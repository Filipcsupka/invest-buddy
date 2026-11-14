import { etfScoreCoverage, etfScoreStatus, type EtfScoreResult } from "@/engine/etf-score";
import { etfBand, type EtfBand } from "@/engine/etf-bands";
import type { EtfMessages } from "@/i18n/etf-messages";
import s from "./etf.module.css";

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

const bandTone = { rulesMet: s.bandRulesMet, mostlyMet: s.bandMostlyMet, partlyMet: s.bandPartlyMet, fewMet: s.bandFewMet } as const;
/** Neutral band chip in the ETF area colour: the shade steps with the band, never a gain or loss colour. */
export function BandBadge({ band, m }: { band: EtfBand; m: EtfMessages }) {
  return <span className={`${s.bandBadge} ${bandTone[band]}`} data-band={band}>{m.scoreStates[band]}</span>;
}

/** Compact list cell: percent, band, groups with data and the Incomplete data flag. Non-band states print their label only. */
export function EtfRatingCell({ score, m }: { score: EtfScoreResult | null | undefined; m: EtfMessages }) {
  if (!score) return <span className={s.muted}>{m.scorePending}</span>;
  const status = etfScoreStatus(score);
  const legacy = score.rulesVersion?.startsWith("etf-v2-") ?? false;
  const { groupsWithData } = etfScoreCoverage(score.rules);
  const total = legacy ? 4 : score.rules.some((rule) => rule.group === "income") ? 8 : 7;
  if (score.percent === null) return <span className={s.ratingState}>{m.scoreStates[status]}</span>;
  const derived = etfBand(score.percent, score.evidencedMax);
  const band = !legacy ? score.band ?? derived.band : null;
  const incomplete = !legacy && (score.incompleteData ?? derived.incompleteData);
  return <div className={s.ratingCell}>
    <span className={s.ratingLine}><strong className={s.ratingPercent}>{score.percent}%</strong>{band && status === band ? <BandBadge band={band} m={m} /> : <span className={s.ratingState}>{m.scoreStates[status]}</span>}</span>
    <span className={s.ratingMeta}>{m.scoreGroupsShort.replace("{count}", String(groupsWithData)).replace("{total}", String(total))}{incomplete ? ` · ${m.scoreIncomplete}` : ""}{legacy ? ` · ${m.scoreLegacy}` : ""}</span>
  </div>;
}

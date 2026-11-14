import pg from "pg";
import { listingAudit } from "../src/data/audit-sql";
import { nextEarnings } from "../src/data/catalyst-calendar";
import { readEarningsSnapshots } from "../src/db/catalyst-calendar";
import { pageScoreRow, scoringMember } from "../src/db/universe";
import type { ScoreResult } from "../src/engine";
import { buildShortlist, sectorConcentration, type CheckId, type SectorConcentration, type SectorShare, type Shortlist } from "../src/engine/shortlist";
import { SHORTLIST_CONFIG } from "../src/engine/shortlist-config";
import { readListingFacts } from "../src/data/shortlist-sectors";
import { modelHoldings, shortlistInputs, type EarningsFact } from "../src/data/shortlist";
import { applyModelLens, orderedRows, widenedThemes, type ModelLens, type ModelPortfolio } from "../src/engine/model-lens";
import type { PortfolioSnapshot } from "../src/portfolio/model";
import type { StoreRow } from "../src/data/store";

/**
 * Replays the shortlist gates over stored scores (docs/shortlist.md). Read only: every query runs inside a READ ONLY transaction that is
 * rolled back. Run it against a local or disposable database; the coordinator runs it read-only elsewhere.
 *
 *   DATABASE_URL=... npx tsx scripts/shortlist-replay.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--days N] [--top N] [--names]
 *
 * Without dates it replays the newest `--days` score dates (default 5). Per date it also prints the top `--top` names (default
 * SHORTLIST_CONFIG.topN) after the model portfolio lens, using the newest stored portfolio snapshot on or before that date.
 */

type Query = Pick<pg.PoolClient, "query">;
export interface ReplayOptions { from: string | null; to: string | null; days: number; names: boolean; top: number }

export function parseArgs(argv: string[]): ReplayOptions {
  const out: ReplayOptions = { from: null, to: null, days: 5, names: false, top: SHORTLIST_CONFIG.topN };
  const date = (value: string | undefined, flag: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${flag} needs a date YYYY-MM-DD`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") out.from = date(argv[++i], arg);
    else if (arg === "--to") out.to = date(argv[++i], arg);
    else if (arg === "--days") { const n = Number(argv[++i]); if (!Number.isInteger(n) || n < 1 || n > 60) throw new Error("--days needs 1 to 60"); out.days = n; }
    else if (arg === "--top") { const n = Number(argv[++i]); if (!Number.isInteger(n) || n < SHORTLIST_CONFIG.topNMin || n > SHORTLIST_CONFIG.topNMax) throw new Error(`--top needs ${SHORTLIST_CONFIG.topNMin} to ${SHORTLIST_CONFIG.topNMax}`); out.top = n; }
    else if (arg === "--names") out.names = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return out;
}

/** Score dates to replay, newest last. */
export async function replayDates(db: Query, options: ReplayOptions): Promise<string[]> {
  const result = await db.query<{ as_of: string }>(
    `SELECT DISTINCT s.as_of::text AS as_of FROM score_results s
      WHERE ${pageScoreRow()} AND ($1::date IS NULL OR s.as_of >= $1::date) AND ($2::date IS NULL OR s.as_of <= $2::date)
      ORDER BY 1 DESC LIMIT $3`, [options.from, options.to, options.from || options.to ? 400 : options.days]);
  return result.rows.map((row) => row.as_of).reverse();
}

/** Stored listing rows of one score date for members on that date (the same listing audit the scanner reads). */
export async function scoreRowsOn(db: Query, asOf: string): Promise<StoreRow[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: StoreRow["instrument"]["source"]; list: string; audit: ScoreResult }>(
    `SELECT DISTINCT ON (s.ticker) s.ticker, i.name, i.sector, m.tier, i.source, m.list, ${listingAudit("s")} AS audit
       FROM score_results s JOIN instruments i ON i.ticker=s.ticker JOIN universe_membership m ON m.ticker=s.ticker
      WHERE s.as_of=$1::date AND ${pageScoreRow()} AND ${scoringMember()} AND m.valid_from<=$1::date AND (m.valid_to IS NULL OR m.valid_to>$1::date)
      ORDER BY s.ticker`, [asOf]);
  return result.rows.map((row) => ({ instrument: { ticker: row.ticker, name: row.name, sector: row.sector, tier: row.tier, source: row.source, list: row.list }, result: row.audit }));
}

/** The newest stored portfolio snapshot on or before the date, with theme and sector group per holding. Null when none is stored or it is a sample. */
export async function modelPortfolioOn(db: Query, asOf: string): Promise<ModelPortfolio | null> {
  const result = await db.query<{ snapshot: PortfolioSnapshot }>("SELECT snapshot FROM portfolio_snapshots WHERE as_of <= $1::date ORDER BY as_of DESC LIMIT 1", [asOf]);
  const snapshot = result.rows[0]?.snapshot;
  if (!snapshot?.weights?.length || snapshot.sample) return null;
  const facts = await readListingFacts(db, snapshot.weights.map((w) => w.symbol), snapshot.asOf);
  return { asOf: snapshot.asOf, holdings: modelHoldings(snapshot, facts) };
}

export interface ReplayDay { asOf: string; scored: number; shortlist: Shortlist; lens?: ModelLens | null }

export async function replayDay(db: Query, asOf: string): Promise<Omit<ReplayDay, "asOf">> {
  const rows = await scoreRowsOn(db, asOf);
  const tickers = rows.map((row) => row.instrument.ticker);
  const facts = await readListingFacts(db, tickers, asOf);
  const { rows: snapshots, latestPull } = await readEarningsSnapshots(db, asOf, tickers);
  const earnings = new Map<string, EarningsFact>(nextEarnings(snapshots, asOf, { latestPull }).map((next) => [next.ticker, { reportDate: next.reportDate, stale: next.stale }]));
  const shortlist = buildShortlist(asOf, shortlistInputs(rows, asOf, facts, earnings), SHORTLIST_CONFIG);
  return { scored: rows.length, shortlist, lens: applyModelLens(shortlist.kept, await modelPortfolioOn(db, asOf)) };
}

const CHECKS: CheckId[] = ["evidence", "rs", "liquidity", "report", "drawdown"];

/** The biggest group by count, Unknown included. The lens lists Unknown last, so on a tie the named group wins. */
export function largestGroup(concentration: SectorConcentration): SectorShare | null {
  return concentration.groups.reduce<SectorShare | null>((best, group) => (!best || group.count > best.count ? group : best), null);
}

const pct = (value: number) => `${Math.round(value)}%`;

/** Top-N and model portfolio lens table: one row per date. */
export function formatTopPicks(days: ReplayDay[], top: number = SHORTLIST_CONFIG.topN): string[] {
  const cells = (values: (string | number)[]) => `| ${values.join(" | ")} |`;
  const lines = [
    "",
    `Top ${top} after the model portfolio lens (theme cap ${SHORTLIST_CONFIG.themeCapPercent}%, sector group cap ${SHORTLIST_CONFIG.sectorGroupCapPercent}%). Names in an above-cap theme move below the rest; each part keeps the shortlist order.`,
    "",
    cells(["Date", "Kept", "Model snapshot", "Themes above cap", "Sector groups above cap", "Moved down", `Top ${top}`, "Themes the top names widen"]),
    cells(["---", "---:", "---", "---", "---", "---:", "---", "---"]),
  ];
  for (const { asOf, shortlist, lens } of days) {
    const rows = orderedRows(shortlist.kept, lens).slice(0, top);
    const topText = rows.map((row) => `${row.ticker} (${row.theme}${"lens" in row && row.lens?.status === "over" ? ", over" : ""})`).join(", ") || "none";
    lines.push(cells(lens
      ? [asOf, shortlist.kept.length, lens.weights.asOf, lens.overThemes.map((s) => `${s.key} ${pct(s.weightPercent)}`).join(", ") || "none",
        lens.weights.sectors.filter((s) => s.overCap).map((s) => `${s.key} ${pct(s.weightPercent)}`).join(", ") || "none", lens.moved, topText, widenedThemes(rows).join(", ") || "none"]
      : [asOf, shortlist.kept.length, "none", "no lens", "no lens", 0, topText, "no lens"]));
  }
  const last = days.at(-1)?.lens;
  if (last) lines.push("", `Model portfolio ${last.weights.asOf} by theme: ${last.weights.themes.map((s) => `${s.key} ${pct(s.weightPercent)}`).join(", ")}.`,
    `By sector group: ${last.weights.sectors.map((s) => `${s.key} ${pct(s.weightPercent)}`).join(", ")}.`);
  return lines;
}

/** One markdown table row per date, then optional name lists, then the top-N lens table. */
export function formatReplay(days: ReplayDay[], names = false, top: number = SHORTLIST_CONFIG.topN): string {
  const cells = (values: (string | number)[]) => `| ${values.join(" | ")} |`;
  const lines = [
    `Shortlist replay, config ${SHORTLIST_CONFIG.version}. F1 >= ${SHORTLIST_CONFIG.minEvidencedPoints}/25 points with data; F2 RS percentile >= ${SHORTLIST_CONFIG.minRsPercentile} and traded value >= ${SHORTLIST_CONFIG.minTradedValueUsd} USD; F3 flags only.`,
    "",
    cells(["Date", "Scored", "Setup met (displayed)", "After F1", "After F1+F2", "Kept", "F3 flagged", ...CHECKS.map((id) => `Not assessed: ${id}`), "Largest sector group"]),
    cells(["---", "---:", "---:", "---:", "---:", "---:", "---:", ...CHECKS.map(() => "---:"), "---"]),
  ];
  for (const { asOf, scored, shortlist } of days) {
    const all = [...shortlist.kept, ...shortlist.dropped];
    const top = largestGroup(sectorConcentration(shortlist.kept));
    lines.push(cells([asOf, scored, shortlist.candidates, shortlist.survivors.afterF1, shortlist.survivors.afterF2, shortlist.kept.length, shortlist.survivors.flaggedF3,
      ...CHECKS.map((id) => all.filter((row) => row.notAssessed.includes(id)).length),
      top ? `${top.sector} ${top.count}/${shortlist.kept.length}${top.flagged ? " (over limit)" : ""}` : "none"]));
  }
  if (names) for (const { asOf, shortlist } of days) {
    lines.push("", `${asOf} kept: ${shortlist.kept.map((row) => `${row.rank}. ${row.ticker} (${row.sector})`).join(", ") || "none"}`);
    lines.push(`${asOf} dropped: ${shortlist.dropped.map((row) => `${row.ticker} ${row.dropReasons.join("+")}`).join(", ") || "none"}`);
  }
  lines.push(...formatTopPicks(days, top));
  if (names) for (const { asOf, shortlist, lens } of days) {
    lines.push("", `${asOf} lens order: ${orderedRows(shortlist.kept, lens).map((row) => `${row.rank}. ${row.ticker} (${row.theme}${"lens" in row && row.lens ? `, ${row.lens.status}` : ""})`).join(", ") || "none"}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Replays inside one READ ONLY transaction and always rolls it back. */
export async function runReplay(db: Pick<pg.Pool, "connect">, options: ReplayOptions): Promise<string> {
  const client = await db.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const days: ReplayDay[] = [];
    for (const asOf of await replayDates(client, options)) days.push({ asOf, ...(await replayDay(client, asOf)) });
    return formatReplay(days, options.names, options.top);
  } finally {
    await client.query("ROLLBACK").finally(() => client.release());
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try { process.stdout.write(await runReplay(db, options)); }
  finally { await db.end(); }
}

if (/(?:^|[/\\])shortlist-replay\.(?:ts|js)$/.test(process.argv[1] ?? "")) void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

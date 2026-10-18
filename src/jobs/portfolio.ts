import { runLoggedJob } from "./job-log";
import pg from "pg";
import { fixtureProvider } from "../data/fixtures";
import { PostgresPortfolioRepository, type PortfolioRepository } from "../db/portfolio";
import { baselineSchema, type Baseline } from "../db/portfolio-baseline";
import { flexServiceFromEnv } from "../portfolio/flex";
import { navPointsFromXml } from "../portfolio/history";
import { PostgresNavHistoryRepository, type NavHistoryRepository } from "../db/portfolio-history";
import { normalizeFlex, parseFlexPortfolio } from "../portfolio/model";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface BaselineTarget { baseUrl: string; token: string; fetcher?: Fetcher }

const defaultFetcher: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });

function errorDetail(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  let message = error.message;
  for (const secret of [process.env.FLEX_TOKEN, process.env.FLEX_QUERY_ID, process.env.INGEST_TOKEN]) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  if (message.includes("<")) message = "[XML omitted]";
  message = message.replace(/https?:\/\/\S+/gi, "[URL]").replace(/\s+/g, " ").slice(0, 180);
  return `${error.name}: ${message}`;
}

/**
 * Posts the Flex baseline to the ingest API. Returns a status word only.
 * The last stored monthly contribution is carried over, or stays null. If it cannot be read the post is skipped,
 * because the upsert would otherwise overwrite a stored value with null.
 */
export async function postBaseline(xml: string, target: BaselineTarget, today?: string): Promise<{ status: "posted" | "skipped" | "rejected"; positions: number; skipped: number }> {
  const fetcher = target.fetcher ?? defaultFetcher;
  const eur = parseFlexPortfolio(xml, today);
  const headers = { authorization: `Bearer ${target.token}` };
  const base = target.baseUrl.replace(/\/+$/, "");
  const prior = await fetcher(`${base}/api/ingest/portfolio-baseline?asOf=${eur.asOf}`, { headers });
  if (!prior.ok) return { status: "skipped", positions: eur.positions.length, skipped: eur.warnings.skippedPositions };
  const stored = ((await prior.json()) as { baseline?: { monthlyContributionEur?: number | null } | null }).baseline;
  const body: Baseline = baselineSchema.parse({
    asOf: eur.asOf, source: "flex", currency: "EUR", cashEur: eur.cashEur,
    monthlyContributionEur: stored?.monthlyContributionEur ?? null,
    positions: eur.positions,
    trades: eur.trades,
    tradeFromDate: eur.fromDate,
  });
  const response = await fetcher(`${base}/api/ingest/portfolio-baseline`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.ok ? "posted" : "rejected", positions: eur.positions.length, skipped: eur.warnings.skippedPositions };
}

export async function runPortfolio(repository: PortfolioRepository, delayTradingDays = 1, target?: BaselineTarget, log: (line: string) => void = (line) => process.stdout.write(`${line}\n`), history?: NavHistoryRepository) {
  const xml = await flexServiceFromEnv().statement();
  let failed = false;
  let positions = 0, navPoints = 0, skippedPositions = 0;
  try {
    const snapshot = await normalizeFlex(xml, fixtureProvider, delayTradingDays);
    await repository.save(snapshot);
    positions = snapshot.weights.length;
    log(`snapshot stored positions=${snapshot.weights.length}`);
  } catch (error) { failed = true; log(`snapshot failed; previous snapshot retained (${errorDetail(error)})`); }
  if (history) {
    try {
      const points = navPointsFromXml(xml);
      await history.upsert(points);
      navPoints = points.length;
      log(`nav history upserted points=${points.length}`);
    } catch (error) { failed = true; log(`nav history failed (${errorDetail(error)})`); }
  } else log("nav history not configured");
  if (target) {
    try {
      const result = await postBaseline(xml, target);
      skippedPositions = result.skipped;
      log(`baseline ${result.status} positions=${result.positions} skippedPositions=${result.skipped}`);
      if (result.status === "rejected") failed = true;
    } catch (error) { failed = true; log(`baseline failed (${errorDetail(error)})`); }
  } else log("baseline not configured");
  if (failed) throw new Error("Portfolio sync incomplete");
  return { positions, navPoints, skippedPositions, failures: 0 };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const delay = Number(process.env.PORTFOLIO_DELAY_TRADING_DAYS ?? 1);
  const token = process.env.INGEST_TOKEN;
  const baseUrl = process.env.INGEST_BASE_URL;
  const pool = new pg.Pool({ connectionString: url });
  try {
    return await runPortfolio(new PostgresPortfolioRepository(pool), delay, token && baseUrl ? { baseUrl, token } : undefined, undefined, new PostgresNavHistoryRepository(pool));
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])portfolio\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("portfolio", main);

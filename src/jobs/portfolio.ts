import pg from "pg";
import { fixtureProvider } from "../data/fixtures";
import { PostgresPortfolioRepository, type PortfolioRepository } from "../db/portfolio";
import { baselineSchema, type Baseline } from "../db/portfolio-baseline";
import { flexServiceFromEnv } from "../portfolio/flex";
import { normalizeFlex, parseFlexPortfolio } from "../portfolio/model";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface BaselineTarget { baseUrl: string; token: string; fetcher?: Fetcher }

const defaultFetcher: Fetcher = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });

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
  });
  const response = await fetcher(`${base}/api/ingest/portfolio-baseline`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.ok ? "posted" : "rejected", positions: eur.positions.length, skipped: eur.warnings.skippedPositions };
}

export async function runPortfolio(repository: PortfolioRepository, delayTradingDays = 1, target?: BaselineTarget, log: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {
  const xml = await flexServiceFromEnv().statement();
  let failed = false;
  try {
    const snapshot = await normalizeFlex(xml, fixtureProvider, delayTradingDays);
    await repository.save({ ...snapshot, benchmarkSample: true });
    log(`snapshot stored positions=${snapshot.weights.length}`);
  } catch { failed = true; log("snapshot failed; previous snapshot retained"); }
  if (target) {
    try {
      const result = await postBaseline(xml, target);
      log(`baseline ${result.status} positions=${result.positions} skippedPositions=${result.skipped}`);
      if (result.status === "rejected") failed = true;
    } catch { failed = true; log("baseline failed"); }
  } else log("baseline not configured");
  if (failed) throw new Error("Portfolio sync incomplete");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const delay = Number(process.env.PORTFOLIO_DELAY_TRADING_DAYS ?? 1);
  const token = process.env.INGEST_TOKEN;
  const baseUrl = process.env.INGEST_BASE_URL;
  const pool = new pg.Pool({ connectionString: url });
  try {
    await runPortfolio(new PostgresPortfolioRepository(pool), delay, token && baseUrl ? { baseUrl, token } : undefined);
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])portfolio\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch(() => { console.error("Portfolio sync failed; previous snapshot retained"); process.exitCode = 1; });

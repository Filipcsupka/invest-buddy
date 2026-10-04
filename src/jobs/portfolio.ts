import pg from "pg";
import { fixtureProvider } from "../data/fixtures";
import { PostgresPortfolioRepository, type PortfolioRepository } from "../db/portfolio";
import { flexServiceFromEnv } from "../portfolio/flex";
import { normalizeFlex } from "../portfolio/model";

export async function runPortfolio(repository: PortfolioRepository, delayTradingDays = 1) {
  const xml = await flexServiceFromEnv().statement();
  const snapshot = await normalizeFlex(xml, fixtureProvider, delayTradingDays);
  await repository.save({ ...snapshot, benchmarkSample: true });
  return snapshot.asOf;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const delay = Number(process.env.PORTFOLIO_DELAY_TRADING_DAYS ?? 1);
  const pool = new pg.Pool({ connectionString: url });
  try {
    const date = await runPortfolio(new PostgresPortfolioRepository(pool), delay);
    process.stdout.write(`Portfolio snapshot stored for ${date}\n`);
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])portfolio\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch(() => { console.error("Portfolio sync failed; previous snapshot retained"); process.exitCode = 1; });

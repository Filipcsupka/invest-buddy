import pg from "pg";
import { score } from "../engine";
import type { UniverseProvider } from "../data/providers";
import { fixtureProvider } from "../data/fixtures";
import type { ScoreRepository, ScoredInstrument, SaveOutcome } from "../db/types";
import { PostgresScoreRepository } from "../db/postgres";
import { MemoryScoreRepository } from "../db/memory";
import { DatabaseUniverseProvider } from "../data/db-provider";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function runDaily(provider: UniverseProvider, repository: ScoreRepository, asOf?: string, providerName = "fixture"): Promise<SaveOutcome> {
  if (asOf && !validDate(asOf)) throw new Error("Date must be YYYY-MM-DD");
  const instruments = await provider.instruments();
  const inputs = await Promise.all(instruments.map(async (instrument) => ({ instrument,
    bars: await provider.bars(instrument.ticker),
    fundamentals: await provider.fundamentals(instrument.ticker),
    macro: await provider.macro(instrument.ticker),
  })));
  const date = asOf ?? (provider instanceof DatabaseUniverseProvider ? await provider.latestScanDate() : inputs[0]?.bars.at(-1)?.date);
  if (!date || !validDate(date)) throw new Error("No valid data date available");
  const records: ScoredInstrument[] = inputs.map(({ instrument, bars, fundamentals, macro }) => {
    const throughDate = bars.filter((bar) => bar.date <= date);
    if (!(provider instanceof DatabaseUniverseProvider) && throughDate.at(-1)?.date !== date) throw new Error(`${instrument.ticker} has no bar on ${date}`);
    const result = score({ ticker: instrument.ticker, bars: throughDate, fundamentals, macro });
    const origin = provider instanceof DatabaseUniverseProvider ? provider.provenance.get(instrument.ticker) : undefined;
    return { instrument, result: { ...result, asOf: date, ...(origin ? { scanRunId: Object.values(origin.runIds)[0], scanRunIds: origin.runIds, agreement: origin.agreement, consensusValues: origin.consensusValues, evidenceUrls: origin.evidenceUrls } : {}) } };
  });
  return repository.saveDaily(date, providerName, records);
}

async function main() {
  const args = process.argv.slice(2);
  const memory = args.includes("--memory");
  const dateIndex = args.indexOf("--date");
  const date = dateIndex >= 0 ? args[dateIndex + 1] : undefined;
  if (dateIndex >= 0 && !date) throw new Error("--date requires YYYY-MM-DD");
  if (args.some((arg, index) => arg !== "--memory" && arg !== "--date" && index !== dateIndex + 1)) throw new Error("Usage: npm run daily -- [--date YYYY-MM-DD] [--memory]");
  const url = process.env.DATABASE_URL;
  if (!memory && !url) throw new Error("DATABASE_URL is required; use --memory for a fixture-only run");
  const pool = memory ? null : new pg.Pool({ connectionString: url });
  try {
    const fixtureMode = process.env.DATA_MODE === "fixture" || memory;
    const provider = fixtureMode ? fixtureProvider : new DatabaseUniverseProvider(pool!, date);
    const result = await runDaily(provider, pool ? new PostgresScoreRepository(pool) : new MemoryScoreRepository(), date, fixtureMode ? "fixture" : "scan");
    process.stdout.write(`${result.inserted ? "Stored" : "Already stored"}: ${result.instrumentCount} instruments, ${result.alerts.length} state changes\n`);
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])daily\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error); process.exitCode = 1; });

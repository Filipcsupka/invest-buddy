import { expect, it } from "vitest";
import { score } from "../engine";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "../data/fixtures";
import { PostgresScoreRepository } from "./postgres";

const instrument = instruments[0];
const bars = fixtureBars(instrument.ticker);
const result = { ...score({ ticker: instrument.ticker, bars, fundamentals: fixtureFundamentals(instrument.ticker), macro: fixtureMacro(instrument.ticker) }),
  scanRunId: "11111111-1111-4111-8111-111111111111" };

function repository(allReal: boolean, found = 1) {
  const sql: string[] = [];
  const client = { query: async (statement: string) => {
    sql.push(statement);
    if (statement.includes("FROM scan_runs")) return { rows: [{ found, all_real: allReal }] };
    if (statement.includes("count(*)::text AS count")) return { rows: [{ count: "0" }] };
    return { rows: [], rowCount: 1 };
  }, release() {} };
  return { sql, repo: new PostgresScoreRepository({ connect: async () => client } as never) };
}

it("keeps local-sample scan data out of the permanent record", async () => {
  const { repo, sql } = repository(false);
  await repo.saveDaily(result.asOf, "scan", [{ instrument, result }]);
  expect(sql.some((statement) => statement.includes("INSERT INTO score_results"))).toBe(true);
  expect(sql.some((statement) => statement.includes("INSERT INTO record_snapshots"))).toBe(false);
  expect(sql.some((statement) => statement.includes("INSERT INTO record_signals"))).toBe(false);
});

it("stores a snapshot when all scan provenance is present and real", async () => {
  const { repo, sql } = repository(true);
  await repo.saveDaily(result.asOf, "scan", [{ instrument, result }]);
  expect(sql.some((statement) => statement.includes("INSERT INTO record_snapshots"))).toBe(true);
  expect(sql.find((statement) => statement.includes("FROM scan_runs"))).toContain("runner->>'dataMode'='real'");
});

it("requires explicit real provenance even when the run ID exists", async () => {
  for (const allReal of [false, true]) {
    const { repo, sql } = repository(allReal, allReal ? 0 : 1);
    await repo.saveDaily(result.asOf, "scan", [{ instrument, result }]);
    expect(sql.some((statement) => statement.includes("INSERT INTO record_snapshots"))).toBe(false);
  }
});

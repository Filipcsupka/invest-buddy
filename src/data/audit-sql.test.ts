import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import { trimmedAudit } from "./audit-sql";

const db = new PGlite();
const bars = Array.from({ length: 500 }, (_, i) => ({ date: `d${i}`, close: i }));
beforeAll(async () => {
  await db.exec("CREATE TABLE score_results (ticker text, audit jsonb)");
  await db.query("INSERT INTO score_results VALUES ('LONG',$1),('SHORT',$2),('NONE',$3)", [
    JSON.stringify({ total: 9, inputs: { bars, fundamentals: { epsBeat: true } } }),
    JSON.stringify({ inputs: { bars: bars.slice(0, 3) } }),
    JSON.stringify({ total: 1 }),
  ]);
});
afterAll(() => db.close());

const read = async (keep?: number) => Object.fromEntries((await db.query<{ ticker: string; audit: { total?: number; inputs?: { bars: { date: string }[]; fundamentals?: unknown } } }>(
  `SELECT ticker,${trimmedAudit("s.audit", keep)} AS audit FROM score_results s`)).rows.map((row) => [row.ticker, row.audit]));

it("keeps the latest sessions in order and leaves other audit fields", async () => {
  const rows = await read();
  expect(rows.LONG.inputs?.bars).toHaveLength(320);
  expect(rows.LONG.inputs?.bars[0].date).toBe("d180");
  expect(rows.LONG.inputs?.bars.at(-1)?.date).toBe("d499");
  expect(rows.LONG.inputs?.fundamentals).toEqual({ epsBeat: true });
  expect(rows.LONG.total).toBe(9);
  expect(rows.SHORT.inputs?.bars).toHaveLength(3);
  expect(rows.NONE).toEqual({ total: 1 });
});

it("drops bars entirely when no sessions are needed", async () => {
  const rows = await read(0);
  expect(rows.LONG.inputs?.bars).toEqual([]);
  expect(rows.SHORT.inputs?.bars).toEqual([]);
  expect(rows.NONE).toEqual({ total: 1 });
});

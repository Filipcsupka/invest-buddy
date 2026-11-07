import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

let db: PGlite;
vi.mock("pg", () => ({ default: { Pool: class {
  query(sql: string, params?: unknown[]) { return db.query(sql, params); }
  async end() {}
} } }));
import { GET, POST } from "./route";

const original = { database: process.env.DATABASE_URL, token: process.env.INGEST_TOKEN, privateUse: process.env.EODHD_PRIVATE_USE };
const headers = { authorization: "Bearer test-token" };
const get = (date?: string) => GET(new Request(`http://local/api/ingest/gate?stage=judge${date ? `&date=${date}` : ""}`, { headers }));
const post = (date: string, revision: number, completedSymbols?: string[]) => POST(new Request("http://local/api/ingest/gate", {
  method: "POST", headers, body: JSON.stringify({ stage: "judge", date, revision, completedSymbols }),
}));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE scheduled_gates (
    gate_date date PRIMARY KEY, symbols text[] NOT NULL, reasons jsonb NOT NULL, accessions jsonb NOT NULL,
    extracted_at timestamptz, judged_at timestamptz, revision integer NOT NULL, judge_superseded_by date
  )`);
  process.env.DATABASE_URL = "postgresql://test";
  process.env.INGEST_TOKEN = "test-token";
});
afterEach(async () => {
  await db.exec("DELETE FROM scheduled_gates");
  delete process.env.EODHD_PRIVATE_USE;
});
afterAll(async () => {
  if (original.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.database;
  if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token;
  if (original.privateUse === undefined) delete process.env.EODHD_PRIVATE_USE; else process.env.EODHD_PRIVATE_USE = original.privateUse;
  await db.close();
});

it("keeps unrelated older symbols pending and completes a gate by symbol", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  await db.query(`INSERT INTO scheduled_gates VALUES
    ('2000-01-03', ARRAY['AAPL'], '{}', '{}', NULL, now(), 1, NULL),
    ('2000-01-04', ARRAY['AMD'], '{"AMD":["new fact"]}', '{"AMD":[]}', NULL, NULL, 2, NULL),
    ('2000-01-05', ARRAY['AVGO'], '{"AVGO":["new fact"]}', '{"AVGO":[]}', NULL, NULL, 1, NULL)`);
  const first = await get();
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ asOf: "2000-01-04", symbols: ["AMD"], revision: 2, consumed: false });
  expect((await post("2000-01-05", 2, ["AVGO"])).status).toBe(409);
  expect((await post("2000-01-05", 1, ["AVGO"])).status).toBe(200);
  expect(await (await get()).json()).toMatchObject({ asOf: "2000-01-04", symbols: ["AMD"] });
  expect((await post("2000-01-04", 2, ["AMD"])).status).toBe(200);
  const rows = (await db.query<{ gate_date: string; judged: boolean; superseded: string | null }>(
    "SELECT gate_date::text, judged_at IS NOT NULL AS judged, judge_superseded_by::text AS superseded FROM scheduled_gates ORDER BY gate_date")).rows;
  expect(rows).toEqual([
    { gate_date: "2000-01-03", judged: true, superseded: null },
    { gate_date: "2000-01-04", judged: true, superseded: null },
    { gate_date: "2000-01-05", judged: true, superseded: null },
  ]);
  // Nothing is pending any more.
  expect((await get()).status).toBe(404);
  expect(await (await get("2000-01-05")).json()).toMatchObject({ symbols: [], consumed: true });
  expect(await (await get("2000-01-04")).json()).toMatchObject({ symbols: [], consumed: true });
  // A gate re-opened by a newer detect revision is pending again and is the newest one.
  await db.query("UPDATE scheduled_gates SET revision=2, judged_at=NULL, symbols=ARRAY['AVGO','NVDA'] WHERE gate_date='2000-01-05'");
  expect(await (await get()).json()).toMatchObject({ asOf: "2000-01-05", symbols: ["AVGO", "NVDA"], revision: 2 });
  expect((await post("2000-01-05", 1, ["NVDA"])).status).toBe(409);
});

it("leaves uncompleted symbols in a large gate for the next page", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  const symbols = Array.from({ length: 69 }, (_, i) => `S${String(i).padStart(2, "0")}`);
  await db.query("INSERT INTO scheduled_gates VALUES ('2000-01-06', $1::text[], '{}', '{}', NULL, NULL, 1, NULL)", [symbols]);
  expect((await post("2000-01-06", 1, symbols.slice(0, 12))).status).toBe(200);
  expect(await (await get()).json()).toMatchObject({ asOf: "2000-01-06", symbols: symbols.slice(12), consumed: false });
  expect((await post("2000-01-06", 1, ["UNKNOWN"])).status).toBe(409);
  expect((await post("2000-01-06", 1, symbols.slice(12, 52))).status).toBe(200);
  expect((await post("2000-01-06", 1, symbols.slice(52))).status).toBe(200);
  await expect((await get("2000-01-06")).json()).resolves.toMatchObject({ symbols: [], consumed: true });
});

it("still waits for extraction when stored EODHD facts are disabled", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  await db.query(`INSERT INTO scheduled_gates VALUES ('2000-01-04', ARRAY['AMD'], '{}', '{}', NULL, NULL, 1, NULL)`);
  expect((await get("2000-01-04")).status).toBe(409);
  expect((await post("2000-01-04", 1, ["AMD"])).status).toBe(409);
});

import { expect, it } from "vitest";
import pg from "pg";
import { persistGate } from "../../../../jobs/detect";
import { GET, POST } from "./route";

it.skipIf(!process.env.TEST_DATABASE_URL)("serves and consumes the current gate in stage order", async () => {
  const oldDb = process.env.DATABASE_URL, oldToken = process.env.INGEST_TOKEN;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.INGEST_TOKEN = "f3-test-token";
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const date = "2099-08-12";
  const headers = { authorization: "Bearer f3-test-token", "content-type": "application/json" };
  const get = (stage: string) => GET(new Request(`http://local/api/ingest/gate?stage=${stage}&date=${date}`, { headers }));
  const post = (stage: string, revision: number) => POST(new Request("http://local/api/ingest/gate", { method: "POST", headers, body: JSON.stringify({ stage, date, revision }) }));
  try {
    const gate = await persistGate(pool, { asOf: date, symbols: ["NVDA"], reasons: { NVDA: ["10-Q"] }, accessions: { NVDA: ["0000000000-99-000001"] } });
    expect((await get("judge")).status).toBe(409);
    expect((await (await get("extract")).json()).symbols).toEqual(["NVDA"]);
    expect((await post("extract", gate.revision!)).status).toBe(200);
    expect((await (await get("extract")).json()).symbols).toEqual([]);
    expect((await (await get("judge")).json()).symbols).toEqual(["NVDA"]);
    const next = await persistGate(pool, { asOf: date, symbols: ["AMD"], reasons: { AMD: ["discovery"] }, accessions: { AMD: [] } });
    expect((await post("judge", gate.revision!)).status).toBe(409);
    expect((await get("judge")).status).toBe(409);
    expect((await (await get("extract")).json()).symbols).toEqual(["AMD", "NVDA"]);
    expect((await post("extract", next.revision!)).status).toBe(200);
    expect((await post("judge", next.revision!)).status).toBe(200);
    expect((await (await get("judge")).json()).symbols).toEqual([]);
  } finally {
    await pool.query("DELETE FROM scheduled_gates WHERE gate_date=$1", [date]);
    await pool.end();
    if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
    if (oldToken === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = oldToken;
  }
});

it.skipIf(!process.env.TEST_DATABASE_URL)("returns an earlier pending gate for the next scheduled run", async () => {
  const oldDb = process.env.DATABASE_URL, oldToken = process.env.INGEST_TOKEN;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.INGEST_TOKEN = "quota-gate-test-token";
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const date = "2000-01-04";
  const headers = { authorization: "Bearer quota-gate-test-token" };
  try {
    const gate = await persistGate(pool, { asOf: date, symbols: ["NVDA"], reasons: { NVDA: ["pending"] }, accessions: { NVDA: [] } });
    const get = async (stage: string) => GET(new Request(`http://local/api/ingest/gate?stage=${stage}`, { headers }));
    const extract = await get("extract");
    expect(extract.status).toBe(200);
    expect(await extract.json()).toMatchObject({ asOf: date, symbols: ["NVDA"] });
    const before = await get("judge");
    if (before.status === 200) expect((await before.json()).asOf).not.toBe(date);
    await pool.query("UPDATE scheduled_gates SET extracted_at=now() WHERE gate_date=$1", [date]);
    const judge = await get("judge");
    expect(judge.status).toBe(200);
    expect(await judge.json()).toMatchObject({ asOf: date, symbols: ["NVDA"], revision: gate.revision });
  } finally {
    await pool.query("DELETE FROM scheduled_gates WHERE gate_date=$1", [date]);
    await pool.end();
    if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
    if (oldToken === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = oldToken;
  }
});

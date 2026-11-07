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
const post = (date: string, revision: number) => POST(new Request("http://local/api/ingest/gate", {
  method: "POST", headers, body: JSON.stringify({ stage: "judge", date, revision }),
}));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE scheduled_gates (
    gate_date date PRIMARY KEY, symbols text[] NOT NULL, reasons jsonb NOT NULL, accessions jsonb NOT NULL,
    extracted_at timestamptz, judged_at timestamptz, revision integer NOT NULL
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

it("judges the oldest stored-fact gate without extraction and consumes its current revision", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  await db.query(`INSERT INTO scheduled_gates VALUES
    ('2000-01-04', ARRAY['AMD'], '{"AMD":["new fact"]}', '{"AMD":[]}', NULL, NULL, 2),
    ('2000-01-05', ARRAY['AVGO'], '{"AVGO":["new fact"]}', '{"AVGO":[]}', NULL, NULL, 1)`);
  const first = await get();
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ asOf: "2000-01-04", symbols: ["AMD"], revision: 2, consumed: false });
  expect((await post("2000-01-04", 1)).status).toBe(409);
  expect((await post("2000-01-04", 2)).status).toBe(200);
  expect(await (await get()).json()).toMatchObject({ asOf: "2000-01-05", symbols: ["AVGO"] });
  expect(await (await get("2000-01-04")).json()).toMatchObject({ symbols: [], consumed: true });
  await db.query("UPDATE scheduled_gates SET revision=3, judged_at=NULL, symbols=ARRAY['AMD','NVDA'] WHERE gate_date='2000-01-04'");
  expect(await (await get()).json()).toMatchObject({ asOf: "2000-01-04", symbols: ["AMD", "NVDA"], revision: 3 });
  expect((await post("2000-01-04", 2)).status).toBe(409);
});

it("still waits for extraction when stored EODHD facts are disabled", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  await db.query(`INSERT INTO scheduled_gates VALUES ('2000-01-04', ARRAY['AMD'], '{}', '{}', NULL, NULL, 1)`);
  expect((await get("2000-01-04")).status).toBe(409);
  expect((await post("2000-01-04", 1)).status).toBe(409);
});

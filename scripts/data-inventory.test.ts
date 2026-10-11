import pg from "pg";
import { describe, expect, it } from "vitest";
import { collectInventory, formatBytes, INVENTORY_TABLES, inventoryMarkdown, type Queryable } from "./data-inventory";

describe("inventory formatting", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 kB");
    expect(formatBytes(9.9 * 1024 * 1024)).toBe("9.9 MB");
  });

  it("collects from a stub and prints a markdown row per table", async () => {
    const log: string[] = [];
    const db: Queryable = {
      async query(text) {
        log.push(text);
        if (/to_regclass/.test(text)) return { rows: [{ present: true }] };
        if (/pg_database_size/.test(text)) return { rows: [{ bytes: "31457280" }] };
        if (/count\(\*\) AS rows, .*pg_total_relation_size/.test(text)) return { rows: [{ rows: "3", min: null, max: null, bytes: "8192" }] };
        return { rows: [] };
      },
    };
    const inv = await collectInventory(db);
    expect(inv.tables.map((t) => t.table)).toEqual(INVENTORY_TABLES.map((t) => t.table));
    expect(inv.tables[0]).toMatchObject({ rows: 3, bytes: 8192 });
    expect(log.every((text) => /^\s*select\b/i.test(text))).toBe(true);
    const md = inventoryMarkdown(inv);
    for (const { table } of INVENTORY_TABLES) expect(md).toContain(`| ${table} |`);
  });
});

/** Seeds rows inside a transaction and rolls back. Needs a migrated TEST_DATABASE_URL. */
describe("data inventory (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("counts seeded rows and issues only SELECT statements", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const log: string[] = [];
    const logged: Queryable = { query: (text, values) => { log.push(text); return client.query(text, values); } };
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      const before = await collectInventory(logged);
      await client.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('ZZINV','Inventory test','Test',1,'guide')");
      for (const day of ["2031-03-03", "2031-03-04"]) {
        await client.query("INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume) VALUES ('ZZINV',$1,1,2,1,2,100)", [day]);
      }
      await client.query(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,expires_at) VALUES
        ('inventory-test','ZZINV','8-K','https://example.com/inv-a','2031-03-01T00:00:00Z','a',repeat('a',100),'2031-03-15T00:00:00Z'),
        ('inventory-test','ZZINV','8-K','https://example.com/inv-b','2031-03-02T00:00:00Z','b',repeat('b',50),'2031-03-20T00:00:00Z')`);
      await client.query("INSERT INTO collected_facts (symbol,fact_key,as_of,value,expires_at) VALUES ('ZZINV','inventory_test_key','2031-03-05','{}'::jsonb,'2031-03-25T00:00:00Z')");

      await client.query(`INSERT INTO raw_snapshots (source_id,key,content_hash,content_type,size_bytes,body) VALUES
        ('sec','inventory-test-a','h1','text/plain',1000,'\\x1f8b'::bytea), ('sec','inventory-test-b','h2','text/plain',500,'\\x1f8b'::bytea)`);

      log.length = 0;
      const after = await collectInventory(logged);
      const rows = (inv: typeof after, name: string) => inv.tables.find((t) => t.table === name)?.rows ?? 0;
      expect(rows(after, "instruments") - rows(before, "instruments")).toBe(1);
      expect(rows(after, "daily_bars") - rows(before, "daily_bars")).toBe(2);
      expect(rows(after, "source_documents") - rows(before, "source_documents")).toBe(2);
      expect(rows(after, "collected_facts") - rows(before, "collected_facts")).toBe(1);
      expect(after.tables.find((t) => t.table === "daily_bars")?.max).toBe("2031-03-04");
      expect(after.documentsBySource.find((g) => g.key === "inventory-test")).toMatchObject({ documents: 2, bodyBytes: 150 });
      expect(after.documentExpiry.find((e) => e.month === "2031-03")).toMatchObject({ documents: 2, bodyBytes: 150 });
      expect(after.factExpiry.find((e) => e.month === "2031-03")?.rows).toBe(1);
      expect(after.factsByKey.find((f) => f.key === "inventory_test_key")?.rows).toBe(1);
      expect(rows(after, "raw_snapshots") - rows(before, "raw_snapshots")).toBe(2);
      const snapshotsOf = (inv: typeof after) => inv.snapshotsBySource.find((g) => g.source === "sec");
      expect((snapshotsOf(after)?.sizeBytes ?? 0) - (snapshotsOf(before)?.sizeBytes ?? 0)).toBe(1500);
      expect(inventoryMarkdown(after)).toContain("Raw snapshots by source");
      expect(after.tables.every((t) => t.bytes > 0)).toBe(true);

      expect(log.length).toBeGreaterThan(0);
      expect(log.every((text) => /^\s*select\b/i.test(text))).toBe(true);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});

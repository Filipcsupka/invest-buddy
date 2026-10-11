import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createFilingsBackfillJob, guardFilingsBackfill } from "./filings";
import { MemoryBackfillStore, runBackfill } from "./backfill";
import { collectEdgar } from "../collectors/edgar";

/** In-memory stand-in for the three statements the archive issues: raw_snapshots insert and lookup, filings insert, accession lookup. */
function fakeDb() {
  const snapshots = new Map<string, { id: number; gz: Buffer }>();
  const filings = new Map<string, { ticker: string; form: string; docType: string; hash: string; snapshotId: number; size: number; url: string; sourceId: string }>();
  const db = { async query(sql: string, a: unknown[] = []) {
    if (sql.includes("INSERT INTO raw_snapshots")) {
      const key = `${a[0]}|${a[1]}|${a[3]}`;
      if (snapshots.has(key)) return { rows: [], rowCount: 0 };
      const id = snapshots.size + 1; snapshots.set(key, { id, gz: a[6] as Buffer }); return { rows: [{ id: String(id) }], rowCount: 1 };
    }
    if (sql.includes("FROM raw_snapshots")) return { rows: [{ id: String(snapshots.get(`${a[0]}|${a[1]}|${a[2]}`)!.id) }], rowCount: 1 };
    if (sql.includes("INSERT INTO filings")) {
      const key = `${a[0]}|${a[1]}`, prior = filings.get(key);
      if (prior && prior.hash === a[10]) return { rows: [], rowCount: 0 };
      filings.set(key, { ticker: a[2] as string, form: a[4] as string, docType: a[5] as string, hash: a[10] as string, snapshotId: a[11] as number, size: a[9] as number, url: a[8] as string, sourceId: "sec" });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM filings WHERE accession")) {
      const wanted = new Set(a[0] as string[]);
      return { rows: [...new Set([...filings.keys()].map((k) => k.split("|")[0]))].filter((x) => wanted.has(x)).map((accession) => ({ accession })) };
    }
    throw new Error(`unexpected SQL ${sql.slice(0, 40)}`);
  } };
  return { db: db as never, snapshots, filings };
}

const recent = (rows: [string, string, string, string?][]) => ({ form: rows.map((r) => r[0]), accessionNumber: rows.map((r) => r[1]), primaryDocument: rows.map((r) => `${r[1]}.htm`), filingDate: rows.map((r) => r[2]), items: rows.map((r) => r[3] ?? "") });
const TEN_K = "<html>" + "annual report text ".repeat(34_000) + "</html>";
const SUBMISSIONS = "https://data.sec.gov/submissions/CIK0000000123.json";
const base = (a: string) => `https://www.sec.gov/Archives/edgar/data/123/${a.replace(/-/g, "")}/`;
const pages = {
  [SUBMISSIONS]: { filings: { recent: recent([["10-K", "0000000123-26-000001", "2026-02-20"], ["4", "0000000123-26-000002", "2026-03-01"], ["8-K", "0000000123-26-000003", "2026-05-02", "2.02,9.01"]]),
    files: [{ name: "CIK0000000123-submissions-001.json", filingFrom: "2024-06-01", filingTo: "2025-12-31" }, { name: "CIK0000000123-submissions-002.json", filingFrom: "2023-10-01", filingTo: "2024-05-31" }, { name: "CIK0000000123-submissions-003.json", filingFrom: "2020-01-01", filingTo: "2023-09-30" }] } },
  "https://data.sec.gov/submissions/CIK0000000123-submissions-001.json": recent([["10-Q", "0000000123-25-000004", "2025-08-01"]]),
  "https://data.sec.gov/submissions/CIK0000000123-submissions-002.json": recent([["10-Q", "0000000123-24-000005", "2024-02-01"], ["10-Q", "0000000123-23-000006", "2023-09-15"]]),
} as Record<string, unknown>;
const bodies: Record<string, string> = {
  [`${base("0000000123-26-000001")}0000000123-26-000001.htm`]: TEN_K,
  [`${base("0000000123-26-000003")}0000000123-26-000003.htm`]: "<html>8-K body</html>",
  [`${base("0000000123-26-000003")}index.json`]: JSON.stringify({ directory: { item: [{ name: "0000000123-26-000003.htm" }, { name: "ex991.htm", type: "EX-99.1" }] } }),
  [`${base("0000000123-26-000003")}ex991.htm`]: "<html>press release</html>",
  [`${base("0000000123-25-000004")}0000000123-25-000004.htm`]: "<html>10-Q 2025</html>",
  [`${base("0000000123-24-000005")}0000000123-24-000005.htm`]: "<html>10-Q 2024</html>",
};
const makeGet = (urls: string[], failOnce?: string) => { let failed = false; return async (url: string) => {
  urls.push(url);
  if (url === failOnce && !failed) { failed = true; throw new Error("boom"); }
  if (pages[url]) return JSON.stringify(pages[url]);
  if (url in bodies) return bodies[url];
  throw new Error(`unexpected URL ${url}`);
}; };
const ledger = () => { const rows: { source: string; job: string }[] = []; return { rows, async reserve(source: string, _n: number, ctx: { job: string }) { rows.push({ source, job: ctx.job }); return { allowed: true }; } } as never as { rows: typeof rows } & import("../data/usage").UsageLedger; };
const subjects = async () => [{ ticker: "NVDA", cik: 123 }];

describe("filings backfill (D19)", () => {
  it("stores a 600 KB 10-K whole with a matching hash", async () => {
    expect(TEN_K.length).toBeGreaterThan(600_000);
    const { db, snapshots, filings } = fakeDb();
    await runBackfill(createFilingsBackfillJob(db, makeGet([]), subjects), new MemoryBackfillStore(), ledger());
    const row = filings.get("0000000123-26-000001|0000000123-26-000001.htm")!;
    expect(row).toMatchObject({ form: "10-K", docType: "10-K", sourceId: "sec", size: Buffer.byteLength(TEN_K) });
    expect(row.hash).toBe(createHash("sha256").update(TEN_K).digest("hex"));
    const stored = [...snapshots.values()].find((s) => s.id === row.snapshotId)!;
    expect(gunzipSync(stored.gz).toString("utf8")).toBe(TEN_K);
  });

  it("archives the 8-K exhibit, skips Form 4 and filings before 2023-10-01, and ignores pages that end before the start", async () => {
    const { db, filings } = fakeDb(), urls: string[] = [];
    await runBackfill(createFilingsBackfillJob(db, makeGet(urls), subjects), new MemoryBackfillStore(), ledger());
    expect([...filings.keys()].sort()).toEqual([
      "0000000123-24-000005|0000000123-24-000005.htm", "0000000123-25-000004|0000000123-25-000004.htm",
      "0000000123-26-000001|0000000123-26-000001.htm", "0000000123-26-000003|0000000123-26-000003.htm", "0000000123-26-000003|ex991.htm"]);
    expect(filings.get("0000000123-26-000003|ex991.htm")).toMatchObject({ docType: "8-K EX-99.1", form: "8-K" });
    expect(urls.some((u) => u.includes("submissions-003"))).toBe(false);
    expect([...filings.values()].filter((f) => f.ticker === "NVDA")).toHaveLength(5);
  });

  it("resumes after a crash without refetching and a rerun adds nothing", async () => {
    const { db, filings } = fakeDb(), store = new MemoryBackfillStore(), urls: string[] = [], l = ledger();
    const failing = `${base("0000000123-25-000004")}0000000123-25-000004.htm`;
    const job = createFilingsBackfillJob(db, makeGet(urls, failing), subjects);
    expect((await runBackfill(job, store, l)).status).toBe("failed");
    expect(await store.load("filings", "NVDA")).toMatchObject({ status: "failed" });
    expect((await runBackfill(job, store, l)).status).toBe("completed");
    expect(filings.size).toBe(5);
    expect(urls.filter((u) => u === SUBMISSIONS)).toHaveLength(1);
    expect(urls.filter((u) => u === failing)).toHaveLength(2);
    expect(urls.filter((u) => u.endsWith("0000000123-26-000001.htm"))).toHaveLength(1);
    const before = urls.length;
    await runBackfill(job, store, l);
    expect(urls).toHaveLength(before);
    expect(l.rows.every((r) => r.source === "sec" && r.job === "backfill:filings")).toBe(true);
  });

  it("a fresh state skips filings already archived and fetches nothing new beyond the lists", async () => {
    const { db, filings } = fakeDb();
    await runBackfill(createFilingsBackfillJob(db, makeGet([]), subjects), new MemoryBackfillStore(), ledger());
    const urls: string[] = [];
    await runBackfill(createFilingsBackfillJob(db, makeGet(urls), subjects), new MemoryBackfillStore(), ledger());
    expect(urls.filter((u) => !u.includes("/submissions/"))).toEqual([]);
    expect(filings.size).toBe(5);
  });

  it("stops at the request cap and the dry run makes no request", async () => {
    const { db, filings } = fakeDb(), urls: string[] = [], store = new MemoryBackfillStore();
    const job = createFilingsBackfillJob(db, makeGet(urls), subjects);
    const dry = await runBackfill(job, store, ledger(), { dryRun: true });
    expect(dry.plan).toEqual([{ subject: "NVDA", cursor: null }]);
    expect(urls).toEqual([]);
    expect((await runBackfill(job, store, ledger(), { maxRequests: 2 })).status).toBe("paused");
    expect(urls).toHaveLength(2);
    expect(filings.size).toBe(1);
  });

  it("refuses to start without SEC_USER_AGENT", () => {
    const saved = process.env.SEC_USER_AGENT;
    delete process.env.SEC_USER_AGENT;
    try { expect(() => guardFilingsBackfill()).toThrow(); } finally { if (saved !== undefined) process.env.SEC_USER_AGENT = saved; }
  });
});

describe("collectEdgar archive hook", () => {
  it("hands the full text of each non-Form-4 file and exhibit to the archive", async () => {
    const seen: string[] = [];
    const get = async (url: string) => {
      if (url === SUBMISSIONS) return JSON.stringify({ filings: { recent: pages[SUBMISSIONS] && (pages[SUBMISSIONS] as { filings: { recent: unknown } }).filings.recent } });
      if (url.includes("0000000123-26-000002.htm")) return "<ownershipDocument/>";
      if (url in bodies) return bodies[url];
      throw new Error(url);
    };
    const docs = await collectEdgar("NVDA", 123, "2026-01-01", get, "2026-01-01", async (f) => { seen.push(`${f.docType}:${f.name}:${f.body.length}`); });
    expect(seen).toEqual([`10-K:0000000123-26-000001.htm:${TEN_K.length}`, "8-K:0000000123-26-000003.htm:21", "8-K EX-99.1:ex991.htm:26"]);
    expect(docs.map((d) => d.docType)).toEqual(["10-K", "4", "8-K", "8-K EX-99.1"]);
  });
});

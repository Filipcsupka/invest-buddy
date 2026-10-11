import type pg from "pg";

export interface FilingRow { period: string; filerCik: number; filerName: string; accession: string }
export interface HoldingRow { period: string; filerCik: number; filerName: string; ticker: string; shares: number; valueUsd: number; changeShares: number | null; priorPeriod: string | null }
/** A filer's latest stored filing before a period, with its universe holdings (absent ticker = no position). */
export interface PriorFiling { period: string; shares: Map<string, number> }

export interface InstitutionalStore {
  hasFiling(period: string, filerCik: number): Promise<boolean>;
  priorFilings(period: string, filerCiks: number[]): Promise<Map<number, PriorFiling>>;
  /** Stores one filing and its rows. Returns the number of holding rows added; 0 when the filing is already stored. */
  addFiling(filing: FilingRow, rows: HoldingRow[]): Promise<number>;
}

export class MemoryInstitutionalStore implements InstitutionalStore {
  readonly filings = new Map<string, FilingRow>();
  readonly holdings = new Map<string, HoldingRow>();
  async hasFiling(period: string, filerCik: number) { return this.filings.has(`${period}:${filerCik}`); }
  async priorFilings(period: string, filerCiks: number[]) {
    const out = new Map<number, PriorFiling>();
    for (const cik of filerCiks) {
      const prior = [...this.filings.values()].filter((row) => row.filerCik === cik && row.period < period).sort((a, b) => b.period.localeCompare(a.period))[0];
      if (!prior) continue;
      const shares = new Map<string, number>();
      for (const row of this.holdings.values()) if (row.filerCik === cik && row.period === prior.period) shares.set(row.ticker, row.shares);
      out.set(cik, { period: prior.period, shares });
    }
    return out;
  }
  async addFiling(filing: FilingRow, rows: HoldingRow[]) {
    const key = `${filing.period}:${filing.filerCik}`;
    if (this.filings.has(key)) return 0;
    this.filings.set(key, structuredClone(filing));
    for (const row of rows) this.holdings.set(`${row.period}:${row.filerCik}:${row.ticker}`, structuredClone(row));
    return rows.length;
  }
}

export class PostgresInstitutionalStore implements InstitutionalStore {
  constructor(private readonly db: Pick<pg.Pool, "query">) {}
  async hasFiling(period: string, filerCik: number) {
    const result = await this.db.query("SELECT 1 FROM institutional_filings WHERE period=$1 AND filer_cik=$2", [period, filerCik]);
    return (result.rowCount ?? 0) > 0;
  }
  async priorFilings(period: string, filerCiks: number[]) {
    const out = new Map<number, PriorFiling>();
    if (!filerCiks.length) return out;
    const filings = await this.db.query<{ filer_cik: string; period: string }>(
      `SELECT DISTINCT ON (filer_cik) filer_cik::text, period::text FROM institutional_filings WHERE filer_cik = ANY($1::bigint[]) AND period < $2::date ORDER BY filer_cik, period DESC`, [filerCiks, period]);
    for (const filing of filings.rows) {
      const rows = await this.db.query<{ ticker: string; shares: string }>("SELECT ticker,shares::text FROM institutional_holdings WHERE period=$1 AND filer_cik=$2", [filing.period, filing.filer_cik]);
      out.set(Number(filing.filer_cik), { period: filing.period, shares: new Map(rows.rows.map((row) => [row.ticker, Number(row.shares)])) });
    }
    return out;
  }
  /** One transaction on a pool, so a crash cannot leave a filing without its rows (the rerun would skip it). */
  async addFiling(filing: FilingRow, rows: HoldingRow[]) {
    if (!("connect" in this.db)) return this.insert(this.db, filing, rows);
    const client = await (this.db as pg.Pool).connect();
    try {
      await client.query("BEGIN");
      const added = await this.insert(client, filing, rows);
      await client.query("COMMIT");
      return added;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  private async insert(db: Pick<pg.Pool, "query">, filing: FilingRow, rows: HoldingRow[]) {
    const inserted = await db.query("INSERT INTO institutional_filings (period,filer_cik,filer_name,accession) VALUES ($1,$2,$3,$4) ON CONFLICT (period,filer_cik) DO NOTHING",
      [filing.period, filing.filerCik, filing.filerName, filing.accession]);
    if (!inserted.rowCount) return 0;
    for (const row of rows) await db.query(`INSERT INTO institutional_holdings (period,filer_cik,filer_name,ticker,shares,value_usd,change_shares,prior_period)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (period,filer_cik,ticker) DO NOTHING`,
      [row.period, row.filerCik, row.filerName, row.ticker, row.shares, row.valueUsd, row.changeShares, row.priorPeriod]);
    return rows.length;
  }
}

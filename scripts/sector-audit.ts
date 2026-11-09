import pg from "pg";
import { sectorFromEodhd, UNCLASSIFIED } from "../src/universe/sector";

export interface SectorAuditRow { ticker: string; sector: string; industry: string | null }
export interface IndustryAudit {
  industry: string;
  proposedSector: string;
  names: number;
  unclassified: number;
  fillable: number;
  mismatchedNamed: number;
}

/** Current listings only. A 10,001st row fails closed instead of silently truncating the audit. */
export const SECTOR_AUDIT_SQL = `SELECT i.ticker,i.sector,s.industry FROM instruments i
  LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL
  LEFT JOIN LATERAL (
    SELECT CASE WHEN s.sector_observed_on IS NOT NULL THEN s.industry END AS industry FROM symbols s
    WHERE (s.vendor_symbol=ids.vendor_symbols->>'eodhd' OR s.vendor_symbol=i.ticker
        OR (s.exchange='US' AND s.code=i.ticker))
    ORDER BY CASE WHEN s.vendor_symbol=ids.vendor_symbols->>'eodhd' THEN 0
      WHEN s.vendor_symbol=i.ticker THEN 1 ELSE 2 END, s.vendor_symbol
    LIMIT 1
  ) s ON true
  WHERE i.source<>'benchmark'
  ORDER BY i.ticker LIMIT 10001`;

export function auditSectorRows(rows: SectorAuditRow[]) {
  if (rows.length > 10_000) throw new Error("Sector audit exceeds 10,000 instruments; narrow the query before rerunning");
  const industries = new Map<string, IndustryAudit>();
  let unclassified = 0, fillable = 0, mismatchedNamed = 0, missingIndustry = 0;
  for (const row of rows) {
    const industry = row.industry?.trim() || "(missing)";
    const proposedSector = sectorFromEodhd(row.industry);
    const unknown = row.sector === UNCLASSIFIED;
    const canFill = unknown && proposedSector !== UNCLASSIFIED;
    const mismatch = !unknown && proposedSector !== UNCLASSIFIED && proposedSector !== row.sector;
    if (unknown) unclassified++;
    if (canFill) fillable++;
    if (mismatch) mismatchedNamed++;
    if (industry === "(missing)") missingIndustry++;
    const entry = industries.get(industry) ?? { industry, proposedSector, names: 0, unclassified: 0, fillable: 0, mismatchedNamed: 0 };
    entry.names++;
    if (unknown) entry.unclassified++;
    if (canFill) entry.fillable++;
    if (mismatch) entry.mismatchedNamed++;
    industries.set(industry, entry);
  }
  return { names: rows.length, unclassified, fillable, mismatchedNamed, missingIndustry,
    industries: [...industries.values()].sort((a, b) => b.unclassified - a.unclassified || b.mismatchedNamed - a.mismatchedNamed || a.industry.localeCompare(b.industry)) };
}

/** Human-readable counts and the proposed industry mapping, including unknown industries. */
export function formatSectorAudit(report: ReturnType<typeof auditSectorRows>): string {
  const cells = (values: (string | number)[]) => `| ${values.map((value) => String(value).replaceAll("|", "\\|")).join(" | ")} |`;
  return [
    `Names: ${report.names}; Unclassified: ${report.unclassified}; fillable: ${report.fillable}; named mismatches: ${report.mismatchedNamed}; missing industry: ${report.missingIndustry}`,
    "",
    cells(["EODHD industry", "Names", "Unclassified", "Fillable", "Named mismatches", "Proposed sector"]),
    cells(["---", "---:", "---:", "---:", "---:", "---"]),
    ...report.industries.map((row) => cells([row.industry, row.names, row.unclassified, row.fillable, row.mismatchedNamed, row.proposedSector])),
    "",
  ].join("\n");
}

/** A read-only transaction protects the audit even if its SQL is edited later. */
export async function loadSectorAudit(db: Pick<pg.Pool, "connect">) {
  const client = await db.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const result = await client.query<SectorAuditRow>(SECTOR_AUDIT_SQL);
    return auditSectorRows(result.rows);
  } finally {
    await client.query("ROLLBACK").finally(() => client.release());
  }
}

async function main() {
  if (process.argv.slice(2).join(" ") !== "--dry-run") throw new Error("Usage: DATABASE_URL=... npx tsx scripts/sector-audit.ts --dry-run");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { process.stdout.write(formatSectorAudit(await loadSectorAudit(db))); }
  finally { await db.end(); }
}

if (/(?:^|[/\\])sector-audit\.(?:ts|js)$/.test(process.argv[1] ?? "")) void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

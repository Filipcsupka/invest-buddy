import pg from "pg";
import { fetchCatalogListings } from "./etf-catalog-data";
import { refreshShortlist, upsertCatalog } from "../db/etf-catalog-ingest";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: npm run etf:catalog-sync [-- --dry-run]");
  const dryRun = args.includes("--dry-run");
  const listings = await fetchCatalogListings();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const count = await upsertCatalog(db, listings, today, dryRun);
    const shortlist = dryRun ? 0 : await refreshShortlist(db, today);
    console.log(`etf-catalog: ${count} listings${dryRun ? " (dry run)" : `, ${shortlist} shortlisted`}`);
  } finally { await db.end(); }
}

if (/(?:^|[/\\])etf-catalog\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error); process.exitCode = 1; });

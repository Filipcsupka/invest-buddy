/**
 * Reads the FRED notes of each candidate series and rejects any whose notes contain the word "copyright" (D24).
 * Read-only: one request per series, nothing is stored. FRED_API_KEY is read from the environment only.
 * Usage: FRED_API_KEY=... npx tsx scripts/fred-check-notes.ts [SERIES_ID ...]   (default: the list in src/data/macro-series.ts)
 * Add a rejected id to FRED_REJECTED_SERIES in src/data/macro-series.ts so no job stores it.
 */
import { getText } from "../src/collectors/http";
import { checkSeriesNotes, FRED_MACRO_SERIES } from "../src/data/macro-series";

async function main() {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is required");
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : FRED_MACRO_SERIES.map((series) => series.id);
  const notes: Record<string, string | null> = {};
  for (const id of ids) {
    if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`Bad series id ${id}`);
    const body = JSON.parse(await getText(`https://api.stlouisfed.org/fred/series?series_id=${id}&api_key=${encodeURIComponent(key)}&file_type=json`)) as { seriess?: { notes?: string }[] };
    if (body.seriess?.[0]) notes[id] = body.seriess[0].notes ?? "";
  }
  const { storable, rejected } = checkSeriesNotes(ids, notes);
  process.stdout.write(`storable: ${storable.join(", ") || "none"}\n`);
  for (const item of rejected) process.stdout.write(`rejected: ${item.id} (${item.reason})\n`);
  if (rejected.length) process.exitCode = 1;
}
void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });

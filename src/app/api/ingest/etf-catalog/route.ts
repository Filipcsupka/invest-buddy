import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import schema from "../../../../../scanner/schema/etf-enrich.schema.json";
// @ts-expect-error The shared scanner validator is JavaScript without declaration files.
import { schemaErrors } from "../../../../../scanner/research-validate.mjs";
import { ingestEnrichment, refreshShortlist, type Enrichment } from "../../../../db/etf-catalog-ingest";
import { readBoundedBody } from "../read-bounded-body";
import { logIngestRequest, recordIngestError } from "../request-log";

export const runtime = "nodejs";
export function authorized(header: string | null, token: string): boolean {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return !!supplied && timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(token).digest());
}
export function validateEnrichment(value: unknown): string[] {
  const errors = schemaErrors(value, schema);
  if (errors.length) return errors;
  const rows = (value as { items: Enrichment[] }).items;
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.listingKey)) errors.push(`$.items[${index}].listingKey: duplicate`);
    seen.add(row.listingKey);
    if (row.sourceUrl && !row.sourceUrl.startsWith("https://")) errors.push(`$.items[${index}].sourceUrl: HTTPS required`);
  }
  return errors;
}
async function handler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const body = await readBoundedBody(request, 1_000_000);
  if (body === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let value: unknown; try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const errors = validateEnrichment(value);
  if (errors.length) return Response.json({ error: "Invalid ETF enrichment", fields: errors }, { status: 400 });
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const rows = (value as { items: Enrichment[] }).items;
    await ingestEnrichment(db, rows);
    const shortlist = await refreshShortlist(db, new Date().toISOString().slice(0,10));
    return Response.json({ updated: rows.length, shortlist });
  } catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await db.end(); }
}
export const POST = (request: Request) => logIngestRequest("/api/ingest/etf-catalog", request, () => handler(request));

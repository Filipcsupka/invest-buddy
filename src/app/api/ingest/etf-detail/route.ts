import pg from "pg";
import { parseEtfData, storeEtfDetail, type ParsedEtfData } from "../../../../db/etf-detail";
import { authorized } from "../etf-catalog/route";
import { readBoundedBody } from "../read-bounded-body";
import { logIngestRequest, recordIngestError } from "../request-log";

export const runtime = "nodejs";
export interface EtfDetailIngest { listingKey: string; vendorSymbol: string; data: unknown }

/** Shape checks only; the payload content is parsed by parseEtfData. */
export function validateEtfDetail(value: unknown): { errors: string[]; parsed: ParsedEtfData | null } {
  const errors: string[] = [];
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<EtfDetailIngest> : {};
  if (typeof body.listingKey !== "string" || !/^[A-Za-z0-9:._-]{3,80}$/.test(body.listingKey)) errors.push("$.listingKey: invalid");
  if (typeof body.vendorSymbol !== "string" || !/^[A-Z0-9.-]+\.[A-Z0-9]+$/.test(body.vendorSymbol)) errors.push("$.vendorSymbol: invalid");
  const parsed = errors.length ? null : parseEtfData(body.data);
  if (!errors.length && !parsed) errors.push("$.data.ETF_Data: missing");
  if (parsed?.type && parsed.type.toUpperCase() !== "ETF") errors.push("$.data.General.Type: not an ETF");
  return { errors, parsed };
}

async function handler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const body = await readBoundedBody(request, 5_000_000);
  if (body === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let value: unknown; try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { errors, parsed } = validateEtfDetail(value);
  if (errors.length || !parsed) return Response.json({ error: "Invalid ETF detail", fields: errors }, { status: 400 });
  const { listingKey, vendorSymbol } = value as EtfDetailIngest;
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const listing = await db.query<{ isin: string | null }>("SELECT isin FROM etf_catalog WHERE listing_key=$1", [listingKey]);
    if (!listing.rows[0]) return Response.json({ error: "Unknown listing" }, { status: 404 });
    const isin = listing.rows[0].isin;
    if (isin && parsed.isin && isin !== parsed.isin) return Response.json({ error: "ISIN mismatch" }, { status: 409 });
    const stored = await storeEtfDetail(db, { listingKey, vendorSymbol, asOf: new Date().toISOString().slice(0, 10), origin: "enrich", data: parsed });
    return Response.json({ stored: listingKey, ...stored });
  } catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await db.end(); }
}
export const POST = (request: Request) => logIngestRequest("/api/ingest/etf-detail", request, () => handler(request));

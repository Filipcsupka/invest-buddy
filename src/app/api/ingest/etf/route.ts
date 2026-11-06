import { createHash, timingSafeEqual } from "node:crypto";
import pg from "pg";
import schema from "../../../../../scanner/schema/etf-output.schema.json";
// The scanner's generated validator handles the shared JSON Schema subset.
// @ts-expect-error The scanner validator is JavaScript without declaration files.
import { schemaErrors } from "../../../../../scanner/research-validate.mjs";
import { isIsoDate } from "../../../../db/iso-date";
import { insertEtfResearch, type EtfPayload } from "../../../../db/etf-ingest";
import { logIngestRequest, recordIngestError } from "../request-log";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";
export function authorized(header: string | null, token: string): boolean {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return !!supplied && timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(token).digest());
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isoTime = (value: unknown) => value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
export function validatePayload(value: unknown): string[] {
  if (!object(value)) return ["$: expected object"];
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (key !== "run" && key !== "output") errors.push(`$.${key}: unknown field`);
  if (!object(value.run)) return [...errors, "$.run: expected object"];
  const run = value.run;
  for (const key of Object.keys(run)) if (!["id", "asOf", "adapter", "model", "promptVersion", "status", "stopReason", "startedAt", "finishedAt", "usage"].includes(key)) errors.push(`$.run.${key}: unknown field`);
  if (typeof run.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(run.id)) errors.push("$.run.id: invalid UUID");
  if (typeof run.asOf !== "string" || !isIsoDate(run.asOf)) errors.push("$.run.asOf: invalid date");
  if (run.adapter !== "codex") errors.push("$.run.adapter: expected codex");
  if (run.model !== null && (typeof run.model !== "string" || run.model.length > 60)) errors.push("$.run.model: invalid model");
  if (typeof run.promptVersion !== "string" || !run.promptVersion || run.promptVersion.length > 60) errors.push("$.run.promptVersion: invalid version");
  if (!["ok", "failed", "cutoff", "skipped"].includes(String(run.status))) errors.push("$.run.status: invalid status");
  if (run.stopReason !== null && (typeof run.stopReason !== "string" || run.stopReason.length > 200)) errors.push("$.run.stopReason: invalid reason");
  if (!isoTime(run.startedAt) || !isoTime(run.finishedAt)) errors.push("$.run: invalid timestamp");
  if (!object(run.usage)) errors.push("$.run.usage: expected object");
  if (run.status === "ok") {
    if (!object(value.output)) errors.push("$.output: required for ok run");
    else {
      errors.push(...schemaErrors(value.output, schema));
      const output = value.output as { asOf?: string; candidates?: { symbol: string; isin: string | null; price: { last: number | null; asOf: string | null } }[] };
      if (output.asOf !== run.asOf) errors.push("$.output.asOf: must match run date");
      if (Array.isArray(output.candidates)) {
        const seen = new Set<string>();
        output.candidates.forEach((candidate, index) => {
          if (!candidate || typeof candidate !== "object") return;
          if (seen.has(candidate.symbol)) errors.push(`$.output.candidates[${index}].symbol: duplicate`);
          seen.add(candidate.symbol);
          if (candidate.price && typeof candidate.price === "object") {
            if (candidate.price.last !== null && typeof candidate.price.last === "number" && candidate.price.last <= 0) errors.push(`$.output.candidates[${index}].price.last: must be positive`);
            if (candidate.price.asOf && candidate.price.asOf > String(run.asOf)) errors.push(`$.output.candidates[${index}].price.asOf: after run date`);
          }
        });
      }
    }
  } else if (value.output !== null) errors.push("$.output: expected null for non-ok run");
  return errors;
}
async function handler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await readBoundedBody(request, 1_000_000);
  if (body === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const errors = validatePayload(value);
  if (errors.length) return Response.json({ error: "Invalid ETF output", fields: errors.map((reason) => ({ path: reason.split(":")[0], reason })) }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { return Response.json(await insertEtfResearch(pool, value as unknown as EtfPayload)); }
  catch (error) { recordIngestError(request, error); return Response.json({ error: "Database unavailable" }, { status: 503 }); }
  finally { await pool.end(); }
}
export const POST = (request: Request) => logIngestRequest("/api/ingest/etf", request, () => handler(request));

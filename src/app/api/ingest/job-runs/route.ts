import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PgJobRunStore } from "../../../../jobs/job-runs";
import { logIngestRequest, recordIngestError } from "../request-log";
import { readBoundedBody } from "../read-bounded-body";

export const runtime = "nodejs";

const base = z.object({ runId: z.uuid(), job: z.enum(["extract", "judge"]), startedAt: z.iso.datetime({ offset: true }) });
const bodySchema = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("start") }).strict(),
  base.extend({ action: z.literal("finish"), status: z.enum(["ok", "partial", "failed"]), durationMs: z.number().int().nonnegative(),
    counts: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])), maxRssMb: z.number().int().nonnegative() }).strict(),
]);

function gate(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Ingest unavailable" }, { status: 503 });
  const supplied = request.headers.get("authorization")?.startsWith("Bearer ") ? request.headers.get("authorization")!.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest(), b = createHash("sha256").update(token).digest();
  if (!supplied || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "Database unavailable" }, { status: 503 });
  return null;
}

async function postHandler(request: Request) {
  const denied = gate(request);
  if (denied) return denied;
  const text = await readBoundedBody(request, 2_000);
  if (text === null) return Response.json({ error: "Payload too large" }, { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const store = new PgJobRunStore(process.env.DATABASE_URL!);
  const run = { runId: parsed.data.runId, job: parsed.data.job, startedAt: new Date(parsed.data.startedAt) };
  try {
    if (parsed.data.action === "start") await store.start(run);
    else await store.finish({ ...run, status: parsed.data.status, durationMs: parsed.data.durationMs,
      counts: parsed.data.counts, maxRssMb: parsed.data.maxRssMb });
    return Response.json({ recorded: true });
  } catch (error) {
    recordIngestError(request, error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  } finally { await store.close(); }
}

export const POST = (request: Request) => logIngestRequest("/api/ingest/job-runs", request, () => postHandler(request));

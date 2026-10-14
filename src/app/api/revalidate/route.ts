import { createHash, timingSafeEqual } from "node:crypto";
import { purgeWebCache } from "@/data/purge";
import { CACHE_TAGS } from "@/data/web-cache";
import { logIngestRequest } from "../ingest/request-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(header: string | null, token: string) {
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && supplied.length > 0;
}

/** Purges the cached public reads. Bearer INGEST_TOKEN. Optional body `{ "tags": ["scores"] }`; default is all tags. */
async function postHandler(request: Request) {
  const token = process.env.INGEST_TOKEN;
  if (!token) return Response.json({ error: "Revalidate unavailable" }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), token)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const known = Object.values(CACHE_TAGS) as string[];
  let tags = known;
  const text = await request.text();
  if (text.trim()) {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const asked = (raw as { tags?: unknown })?.tags;
    if (!Array.isArray(asked) || asked.length === 0 || asked.some((tag) => typeof tag !== "string" || !known.includes(tag))) return Response.json({ error: "Invalid tags" }, { status: 400 });
    tags = asked as string[];
  }
  if (!purgeWebCache(tags)) return Response.json({ error: "Revalidate failed" }, { status: 500 });
  return Response.json({ revalidated: tags });
}

export const POST = (request: Request) => logIngestRequest("/api/revalidate", request, () => postHandler(request));

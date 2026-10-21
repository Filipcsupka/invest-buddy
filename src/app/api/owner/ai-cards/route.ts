import { NextRequest, NextResponse } from "next/server";
import { ownerResearchAuthorized } from "@/app/[locale]/owner/research/auth";
import { parseAiCards } from "@/ai-cards/parse";
import { flags } from "@/config/flags";
import { getPool } from "@/db/pool";
import { insertAiCards } from "@/db/ai-cards";
import { readBoundedBody } from "@/app/api/ingest/read-bounded-body";

export async function POST(request: NextRequest) {
  if (!flags().OWNER_VIEW || !ownerResearchAuthorized(request.headers.get("authorization"), process.env.OWNER_RESEARCH_PASSWORD))
    return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="InvestBuddy owner"' } });
  const text = await readBoundedBody(request, 250_000);
  if (!text?.trim()) return NextResponse.json({ error: "Paste must contain 1 to 250,000 bytes" }, { status: 400 });
  const cards = parseAiCards(text);
  if (!cards.length) return NextResponse.json({ error: "No card headers found" }, { status: 400 });
  const preview = cards.flatMap((c) => [c, ...c.children]).map(({ symbol, cardDate, callText, amountText, summary }) => ({ symbol, cardDate, callText, amountText, summary }));
  if (request.nextUrl.searchParams.has("preview")) return NextResponse.json({ preview });
  const db = getPool();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await insertAiCards(client, cards);
    await client.query("COMMIT");
    return NextResponse.json({ preview, ...result });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  } finally { client.release(); }
}

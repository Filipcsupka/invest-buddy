import type pg from "pg";
import { verifyEvidence, type ItemResult } from "../evidence/verify";

export interface EtfEvidence { url: string; quote: string; claim: string }
export interface EtfCandidate {
  symbol: string; exchange: string | null; name: string; isin: string | null; assetClass: "equity" | "bond" | "commodity" | "multi_asset" | "other"; region: string | null;
  call: "BUY_ZONE" | "WATCH" | "AVOID"; conviction: number; thesis: string; whatHappened: string[]; whyItMatters: string;
  plan: { entryZone: string | null; addWhen: string | null; stopAddingWhen: string | null }; risks: string[];
  cost: { terPct: number | null; aumUsdM: number | null; trackedIndex: string | null; domicile: string | null; replication: string | null };
  price: { last: number | null; currency: string | null; asOf: string | null }; evidence: EtfEvidence[];
}
export interface EtfPayload {
  run: { id: string; asOf: string; adapter: string; model: string | null; promptVersion: string; status: "ok" | "failed" | "cutoff" | "skipped"; stopReason: string | null; startedAt: string | null; finishedAt: string | null; usage: Record<string, unknown> };
  output: { asOf: string; candidates: EtfCandidate[] } | null;
}
export type VerifiedEvidence = EtfEvidence & { status: ItemResult["status"]; reason: string; verified: boolean; canonicalUrl: string | null; displayQuote: boolean };
export function verificationStatus(items: VerifiedEvidence[]): "verified" | "partial" | "unverified" {
  const count = items.filter((item) => item.verified).length;
  return count === items.length && count > 0 ? "verified" : count > 0 ? "partial" : "unverified";
}
export async function verifyEtfEvidence(candidate: EtfCandidate, verify = verifyEvidence): Promise<VerifiedEvidence[]> {
  return Promise.all(candidate.evidence.map(async (item) => {
    const result = await verify({ url: item.url, quote: item.quote, publishedAt: null, sourceName: new URL(item.url).hostname, sourceClassHint: "aggregator" });
    return { ...item, status: result.status, reason: result.reason, verified: result.status === "verified", canonicalUrl: result.canonicalUrl ?? null, displayQuote: result.displayQuote };
  }));
}

export type EtfDb = Pick<pg.Pool, "query" | "connect">;
export async function insertEtfResearch(db: EtfDb, payload: EtfPayload, verify = verifyEtfEvidence): Promise<{ replayed: boolean; picks: number; verified: number }> {
  const prior = await db.query("SELECT id FROM etf_research_runs WHERE id=$1", [payload.run.id]);
  if (prior.rowCount) return { replayed: true, picks: 0, verified: 0 };
  const cards = payload.output?.candidates ?? [];
  const checked = await Promise.all(cards.map(async (card) => ({ card, evidence: await verify(card) })));
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const run = payload.run;
    const verifiedCount = checked.filter(({ evidence }) => verificationStatus(evidence) === "verified").length;
    const inserted = await client.query(`INSERT INTO etf_research_runs
      (id,as_of,adapter,model,prompt_version,status,stop_reason,started_at,finished_at,usage,model_output,picks_count,verified_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)
      ON CONFLICT (id) DO NOTHING RETURNING id`,
    [run.id, run.asOf, run.adapter, run.model, run.promptVersion, run.status, run.stopReason, run.startedAt, run.finishedAt,
      JSON.stringify(run.usage), payload.output ? JSON.stringify(payload.output) : null, cards.length, verifiedCount]);
    if (!inserted.rowCount) { await client.query("COMMIT"); return { replayed: true, picks: 0, verified: 0 }; }
    for (const { card, evidence } of checked) {
      const catalog = await client.query(`SELECT listing_key,isin FROM etf_catalog
        WHERE (exchange=$1 AND mnemonic=$2) OR (isin=$3 AND $3 IS NOT NULL)
        ORDER BY CASE WHEN exchange=$1 AND mnemonic=$2 THEN 0 ELSE 1 END LIMIT 1`, [card.exchange,card.symbol,card.isin]);
      if (!catalog.rowCount) throw new Error(`ETF pick ${card.symbol} is outside the catalog`);
      const listingKey = catalog.rows[0].listing_key as string;
      const isin = card.isin ?? (catalog.rows[0].isin as string | null);
      const priorPick = await client.query("SELECT symbol FROM etf_picks WHERE listing_key=$1 LIMIT 1", [listingKey]);
      const symbol = priorPick.rows[0]?.symbol ?? card.symbol;
      const symbolOwner = await client.query("SELECT listing_key FROM etf_picks WHERE symbol=$1", [symbol]);
      if (symbolOwner.rowCount && symbolOwner.rows[0].listing_key && symbolOwner.rows[0].listing_key !== listingKey) throw new Error(`ETF symbol ${symbol} belongs to another catalog listing`);
      const entryPrice = card.call === "BUY_ZONE" && card.price.last !== null ? card.price.last : null;
      const entryDate = entryPrice !== null ? (card.price.asOf ?? run.asOf) : null;
      await client.query(`INSERT INTO etf_picks
        (symbol,exchange,name,isin,asset_class,region,call,conviction,thesis,what_happened,why_it_matters,plan,risks,
         ter_pct,aum_usd_m,tracked_index,domicile,replication,price,price_currency,price_as_of,evidence,verification_status,
         first_seen_at,last_seen_at,first_run_id,last_run_id,entry_price,entry_date,listing_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$25,$26,$27,$28,$29,$30)
        ON CONFLICT (symbol) DO UPDATE SET
        exchange=EXCLUDED.exchange,name=EXCLUDED.name,isin=EXCLUDED.isin,listing_key=EXCLUDED.listing_key,asset_class=EXCLUDED.asset_class,region=EXCLUDED.region,
        call=EXCLUDED.call,conviction=EXCLUDED.conviction,thesis=EXCLUDED.thesis,what_happened=EXCLUDED.what_happened,
        why_it_matters=EXCLUDED.why_it_matters,plan=EXCLUDED.plan,risks=EXCLUDED.risks,ter_pct=EXCLUDED.ter_pct,
        aum_usd_m=EXCLUDED.aum_usd_m,tracked_index=EXCLUDED.tracked_index,domicile=EXCLUDED.domicile,replication=EXCLUDED.replication,
        price=EXCLUDED.price,price_currency=EXCLUDED.price_currency,price_as_of=EXCLUDED.price_as_of,evidence=EXCLUDED.evidence,
        verification_status=EXCLUDED.verification_status,last_seen_at=EXCLUDED.last_seen_at,last_run_id=EXCLUDED.last_run_id,
        entry_price=COALESCE(etf_picks.entry_price,EXCLUDED.entry_price),entry_date=COALESCE(etf_picks.entry_date,EXCLUDED.entry_date),updated_at=now()`,
      [symbol, card.exchange, card.name, isin, card.assetClass, card.region, card.call, card.conviction, card.thesis,
        JSON.stringify(card.whatHappened), card.whyItMatters, JSON.stringify(card.plan), JSON.stringify(card.risks),
        card.cost.terPct, card.cost.aumUsdM, card.cost.trackedIndex, card.cost.domicile, card.cost.replication,
        card.price.last, card.price.currency, card.price.asOf, JSON.stringify(evidence), verificationStatus(evidence),
        run.asOf, run.asOf, run.id, run.id, entryPrice, entryDate, listingKey]);
      await client.query(`INSERT INTO etf_pick_history (symbol,run_id,as_of,call,conviction,price,price_currency)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (symbol,run_id) DO NOTHING`,
      [symbol, run.id, run.asOf, card.call, card.conviction, card.price.last, card.price.currency]);
    }
    await client.query("COMMIT");
    return { replayed: false, picks: cards.length, verified: verifiedCount };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

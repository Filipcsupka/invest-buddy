import pg from "pg";
import { latestIdeaPerSymbol } from "../db/ideas";
import { PostgresDeliveryLog } from "../db/notifications";
import { latestBaseline } from "../db/portfolio-baseline";
import { TelegramNotifier, type Notifier } from "../notify/telegram";
import { ALERT_TEXT, formatIdeaCard, type AlertLocale, type StateName } from "../notify/format";
import { formatResearchCard, ownerContextLines, type ResearchCardInput, type ResearchFact } from "../notify/research-card";
import { loadOwnerContext } from "../db/owner-context";
import { fingerprintHash, materialChange, type AlertFingerprint } from "../research/materiality";
import type { PipelineState, ResearchCandidate } from "../research/types";
import { allocate } from "../engine/allocation";
import { escapeHtml } from "../notify/format";

interface CandidateRow {
  symbol: string; state: PipelineState; state_since: string; review_at: string; promotion_status: string; scorable: boolean;
  upgrade_triggers: string[]; invalidation: string[]; last_alert: AlertFingerprint | null; last_alert_at: string | null;
}
interface FindingRow {
  finding_key: string; dedupe_key: string; kind: string; polarity: string; verification_status: string; confirmed: boolean; source_class: string | null;
  evidence: { url: string; sourceName: string; verify?: { status: string; sourceClass: string } }[]; claim: string; figures: { label: string; value: string; evidenceIndex: number }[];
}
const MATERIAL_KINDS = new Set(["earnings", "guidance", "contract", "regulatory", "clinical", "product", "partnership", "m_and_a"]);
function displayFact(f: FindingRow): ResearchFact | null {
  const index = f.evidence.findIndex(e => e.verify?.status === "verified");
  if (index < 0) return null;
  const evidence = f.evidence[index];
  return { key: f.dedupe_key, findingId: f.finding_key, verified: true, confirmed: f.confirmed,
    sourceClass: evidence.verify?.sourceClass ?? f.source_class, sourceName: evidence.sourceName, url: evidence.url,
    claim: f.claim, figures: f.figures.filter(figure => figure.evidenceIndex === index) };
}

export async function runResearchNotify(pool: pg.Pool, options: { locale: AlertLocale; notifier: Notifier; target: string; now?: Date; site?: string }): Promise<{ sent: number; suppressed: number }> {
  if (process.env.TELEGRAM_CARD_MODE !== "owner" || !process.env.TELEGRAM_OWNER_CHAT_ID || options.target !== process.env.TELEGRAM_OWNER_CHAT_ID)
    return { sent: 0, suppressed: 0 };
  const now = options.now ?? new Date();
  const asOf = now.toISOString().slice(0, 10);
  const site = options.site ?? process.env.SITE_URL ?? "https://invest.filipcsupka.online";
  const rows = await pool.query<CandidateRow>(`SELECT symbol,state,state_since::text,review_at::text,promotion_status,scorable,
    upgrade_triggers,invalidation,last_alert,last_alert_at::text FROM research_candidates ORDER BY symbol`);
  const ideas = new Map((await latestIdeaPerSymbol(pool)).map(i => [i.symbol, i]));
  const baseline = await latestBaseline(pool, asOf);
  const deliveries = new PostgresDeliveryLog(pool);
  let sent = 0, suppressed = 0;
  for (const candidate of rows.rows) {
    const events = await pool.query<{ kind: string; at: string; from_state: string | null; to_state: string | null }>(
      "SELECT kind,at::text,from_state,to_state FROM research_events WHERE symbol=$1 AND kind IN ('discovered','finding_verified','finding_dropped','state_change','review_due','promotion_proposed','promoted') AND (at>$2::timestamptz OR $2::timestamptz IS NULL) ORDER BY at",
      [candidate.symbol, candidate.last_alert_at]);
    const findingRows = (await pool.query<FindingRow>(`SELECT DISTINCT ON (dedupe_key) finding_key,dedupe_key,kind,polarity,verification_status,confirmed,source_class,evidence,claim,figures
      FROM research_findings WHERE symbol=$1 ORDER BY dedupe_key,(verification_status='verified') DESC,verified_at DESC NULLS LAST,id DESC`, [candidate.symbol])).rows;
    const verified = findingRows.filter(f => f.verification_status === "verified");
    const facts: ResearchFact[] = verified.map(displayFact).filter((f): f is ResearchFact => !!f);
    const idea = ideas.get(candidate.symbol);
    const score = await pool.query<{ total: number; state: StateName; percent: string | null }>(
      "SELECT total,state,audit->>'percent' AS percent FROM score_results WHERE ticker=$1 ORDER BY as_of DESC LIMIT 1", [candidate.symbol]);
    const price = await pool.query<{ close: string }>("SELECT close FROM daily_bars WHERE ticker=$1 ORDER BY bar_date DESC LIMIT 1", [candidate.symbol]);
    const fingerprint: AlertFingerprint = { state: candidate.state, action: idea?.action ?? null, tier: idea?.sizeTier ?? null,
      confirmedKeys: verified.filter(f => f.confirmed && MATERIAL_KINDS.has(f.kind)).map(f => f.dedupe_key),
      close: price.rows[0] ? Number(price.rows[0].close) : null, ratings: idea?.setup ?? null,
      relativeScore: score.rows[0]?.percent == null ? null : Number(score.rows[0].percent), band: score.rows[0]?.state ?? null,
      amountMinEur: idea?.amountMinEur ?? 0, amountMaxEur: idea?.amountMaxEur ?? 0, promotionStatus: candidate.promotion_status };
    const negativeReview = events.rows.some(e => e.kind === "review_due") && verified.some(f => f.polarity === "negative");
    const decision = materialChange(fingerprint, candidate.last_alert, candidate.last_alert_at, now, { reviewWithNegative: negativeReview });
    if (!decision.send) {
      if (events.rowCount) await pool.query("INSERT INTO research_events(symbol,kind,reason) VALUES ($1,'alert_suppressed',$2)", [candidate.symbol, decision.reason]);
      suppressed++;
      continue;
    }
    const model = await pool.query<{ id: string; model_output: { candidates: ResearchCandidate[] } }>(
      "SELECT id,model_output FROM research_runs WHERE model_output->'candidates' @> jsonb_build_array(jsonb_build_object('symbol',$1::text)) ORDER BY as_of DESC,created_at DESC LIMIT 1", [candidate.symbol]);
    const card = model.rows[0]?.model_output?.candidates?.find(c => c.symbol === candidate.symbol)?.card ?? null;
    const cardFacts = model.rows[0] ? (await pool.query<FindingRow>(
      "SELECT finding_key,dedupe_key,kind,polarity,verification_status,confirmed,source_class,evidence,claim,figures FROM research_findings WHERE run_id=$1 AND symbol=$2",
      [model.rows[0].id, candidate.symbol])).rows.filter(f => f.verification_status === "verified").map(displayFact).filter((f): f is ResearchFact => !!f) : [];
    const historyRows = await pool.query<{ at: string; to_state: string | null }>(
      "SELECT at::text,to_state FROM research_events WHERE symbol=$1 AND kind IN ('discovered','state_change') ORDER BY at DESC LIMIT 4", [candidate.symbol]);
    const history = historyRows.rows.reverse().filter(e => e.to_state).map(e => ({ state: e.to_state!, date: e.at.slice(0, 10) }));
    const context = (await loadOwnerContext(pool, [candidate.symbol], asOf, { now })).get(candidate.symbol) ?? null;
    let content: string | null;
    if (idea && score.rows[0]) {
      content = formatIdeaCard({ ticker: candidate.symbol, locale: options.locale, site, idea, mode: "owner", adviceOutput: false,
        previous: null, current: { state: score.rows[0].state, points: score.rows[0].total },
        research: { coverage: `${verified.length} verified research facts`, history: history.map(h => `${h.state} ${h.date}`).join(" → "),
          unconfirmed: verified.some(f => !f.confirmed), ownerPath: `/owner/research/${encodeURIComponent(candidate.symbol)}`,
          evidence: facts.filter(f => /^https:\/\//.test(f.url)).slice(0, 4).map(f => ({ url: f.url, label: f.sourceName })),
          lines: ownerContextLines(context, options.locale) } });
    } else {
      const input: ResearchCardInput = { symbol: candidate.symbol, locale: options.locale, site, state: candidate.state,
        stateSince: candidate.state_since, history, promotionStatus: candidate.promotion_status, scorable: candidate.scorable,
        card, facts: cardFacts, upgradeTriggers: candidate.upgrade_triggers, invalidation: candidate.invalidation, cashEur: baseline?.cashEur, context };
      content = formatResearchCard(input);
    }
    if (!content) { await pool.query("INSERT INTO research_events(symbol,kind,reason) VALUES ($1,'alert_suppressed','no checked What happened line')", [candidate.symbol]); suppressed++; continue; }
    const key = { channel: "telegram" as const, target: options.target, asOf: "1970-01-01", kind: `research:${options.locale}:${candidate.symbol}:${fingerprintHash(fingerprint)}` };
    if (!await deliveries.claim(key, 1)) continue;
    try { await options.notifier.send(content); }
    catch (error) { await deliveries.release(key); throw error; }
    await pool.query("UPDATE research_candidates SET last_alert=$2::jsonb,last_alert_at=$3 WHERE symbol=$1", [candidate.symbol, JSON.stringify(fingerprint), now.toISOString()]);
    await pool.query("INSERT INTO research_events(symbol,kind,reason) VALUES ($1,'alert_sent',$2)", [candidate.symbol, decision.reason]); sent++;
  }
  if (now.getUTCDay() === 1) {
    const overdue = rows.rows.filter(c => c.review_at < asOf);
    const ready = rows.rows.some(c => c.state === "START_READY" || c.state === "ADD_READY");
    const result = baseline && allocate({ monthlyContributionEur: baseline.monthlyContributionEur ?? 0, freeCashEur: baseline.cashEur,
      portfolioValueEur: baseline.cashEur + baseline.positions.reduce((sum, p) => sum + p.valueEur, 0),
      positions: baseline.positions.map(p => ({ symbol: p.symbol, valueEur: p.valueEur })), signals: [] });
    if (overdue.length || result?.cashDrag && !ready) {
      const lines = [options.locale === "sk" ? "Týždenný prehľad výskumu" : "Weekly research review"];
      if (overdue.length) lines.push(`${options.locale === "sk" ? "Termín kontroly uplynul" : "Reviews overdue"}: ${overdue.map(c => escapeHtml(c.symbol)).join(", ")}`);
      if (result?.cashDrag && !ready) lines.push(`${options.locale === "sk" ? "Nepridelená hotovosť" : "Unallocated cash"}: EUR ${baseline!.cashEur}. CSPX ALLOCATION: ${options.locale === "sk" ? "bez sumy, pravidlo ešte nebolo schválené" : "no amount pending an approved rule"}.`);
      lines.push(escapeHtml(ALERT_TEXT[options.locale].disclaimer));
      const key = { channel: "telegram" as const, target: options.target, asOf, kind: `research:${options.locale}:monday` };
      if (await deliveries.claim(key, 1)) {
        try { await options.notifier.send(lines.join("\n")); sent++; }
        catch (error) { await deliveries.release(key); throw error; }
      }
    }
  }
  return { sent, suppressed };
}

if (/(?:^|[/\\])research-notify\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (process.env.TELEGRAM_CARD_MODE === "owner" && token && chatId && process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    runResearchNotify(pool, { locale: process.env.DIGEST_LOCALE === "sk" ? "sk" : "en", notifier: new TelegramNotifier({ token, chatId }), target: chatId })
      .then(r => process.stdout.write(JSON.stringify(r) + "\n")).catch(e => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
  }
}

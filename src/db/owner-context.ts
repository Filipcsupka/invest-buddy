import type pg from "pg";
import { catalystCalendar, nextEarnings, type CatalystEvent } from "../data/catalyst-calendar";
import { loadMacroEvents, upcomingMacroEvents, type MacroEvent, type UpcomingEvent } from "../data/macro-calendar";
import { graduation, type Graduation } from "../engine/graduation";
import type { SignalSymbolInput } from "../engine/signals";
import type { OwnerContext } from "../notify/research-card";
import { readEarningsSnapshots, readFutureFindings } from "./catalyst-calendar";
import { estimateRevisions } from "./estimate-revisions";
import { buildJudgeInput, type JudgeSymbol } from "./judge-input";

type Query = Pick<pg.Pool, "query">;

/** Same mapping as signalsFor() in judge-input.ts, so the graduation reads the engine's own action and tier. */
const signalInput = (s: JudgeSymbol): SignalSymbolInput => ({
  symbol: s.symbol, held: null, score: { total: s.score.total, state: s.score.state }, ruleHits: s.ruleHits,
  fields: Object.fromEntries(Object.entries(s.fields).map(([k, f]) => [k, { value: f.value, agreement: f.agreement, verified: f.verified, carriedFrom: f.carriedFrom }])),
  expiredFields: s.expiredFields, technicals: s.technicals,
});

/** A missing table or a failed read leaves that part empty; the card and page still render. */
async function attempt<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try { return await read(); } catch { return fallback; }
}

/** Events on the first macro event date on or after asOf. */
export function nextMacroEvents(asOf: string, events: readonly MacroEvent[]): UpcomingEvent[] {
  const first = events.filter((e) => e.date >= asOf).reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null);
  return first === null ? [] : upcomingMacroEvents(asOf, Number.POSITIVE_INFINITY, [], events.filter((e) => e.date === first));
}

/**
 * Next catalyst, next macro event, graduation and estimate revision per symbol, from stored rows only (no provider call).
 * A public audience gets no graduation and no revision (ADR-001, docs/wording-gate.md).
 */
export async function loadOwnerContext(db: Query, symbols: string[], asOf: string, options: { audience?: "owner" | "public"; now?: Date } = {}): Promise<Map<string, OwnerContext>> {
  const out = new Map<string, OwnerContext>();
  const wanted = [...new Set(symbols)];
  if (!wanted.length) return out;
  const owner = (options.audience ?? "owner") === "owner";
  // Sequential reads, so a single pg.Client works as well as a pool.
  const catalysts = await attempt(async () => {
    const snapshots = await readEarningsSnapshots(db, asOf, wanted);
    const findings = await readFutureFindings(db, asOf, undefined, wanted);
    return catalystCalendar({ next: nextEarnings(snapshots.rows, asOf, { latestPull: snapshots.latestPull }), findings, asOf, symbols: wanted });
  }, [] as CatalystEvent[]);
  const macro = await attempt(async () => nextMacroEvents(asOf, await loadMacroEvents(db, asOf)), [] as UpcomingEvent[]);
  const revisions = owner ? await attempt(() => estimateRevisions(db, wanted, asOf), new Map()) : new Map();
  const graduations = owner ? await attempt(async () => {
    const judge = await buildJudgeInput(db, asOf, options.now ?? new Date(), wanted.length, wanted);
    return new Map(judge.symbols.filter((s) => wanted.includes(s.symbol)).map((s): [string, Graduation] => [s.symbol, graduation(signalInput(s))]));
  }, new Map<string, Graduation>()) : new Map<string, Graduation>();
  for (const symbol of wanted) {
    out.set(symbol, {
      nextCatalyst: catalysts.find((e) => e.symbol === symbol) ?? null,
      macro,
      graduation: graduations.get(symbol) ?? null,
      revision: revisions.get(symbol) ?? null,
    });
  }
  return out;
}

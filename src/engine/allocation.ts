import { ALLOCATION_CONFIG } from "./allocation-config";
import { sizingCap, type AccountBucket } from "./sizing";
import type { SizeTier } from "./signals";

export type AllocationReason =
  | "TIER_AMOUNT" | "ORDER_CEILING" | "CASH_LIMIT" | "RESERVE_LIMIT" | "NAME_CAP"
  | "BELOW_MINIMUM" | "NO_CASH" | "NO_BUY_SIGNAL" | "ADD_ALREADY_THIS_MONTH" | "ADD_HISTORY_UNKNOWN" | "DUPLICATE_SIGNAL";

export interface AllocationPosition { symbol: string; valueEur: number; /** null confirms no add this month; undefined means history is unknown. */ lastAddMonth?: string | null }
export interface AllocationSignal { symbol: string; tier: SizeTier; score: number; asOf: string; action: "START_POSITION" | "ADD" | "HIGH_CONVICTION_ADD" | "WATCH" | "HOLD" | "REDUCE" | "THESIS_BROKEN" | "CSPX_ALLOCATION" }
export interface AllocationInput { monthlyContributionEur: number; freeCashEur: number; portfolioValueEur: number; positions: AllocationPosition[]; signals: AllocationSignal[] }
export interface AllocationSuggestion { symbol: string; tier: SizeTier; amountEur: number; reason: AllocationReason; capped: boolean }
export interface AllocationResult { suggestions: AllocationSuggestion[]; carriedCashEur: number; cashDrag: boolean; reserveEur: number }

const cents = (value: number) => Math.round(value * 100);
const eur = (value: number) => value / 100;
const safe = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
const month = (asOf: string) => /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf.slice(0, 7) : null;

function accountBucket(value: number): AccountBucket {
  return value < 5000 ? "UNDER_5K" : value < 25000 ? "5K_TO_25K" : value < 100000 ? "25K_TO_100K" : "OVER_100K";
}

function tierRule(signal: AllocationSignal) {
  const c = ALLOCATION_CONFIG;
  if (signal.action === "START_POSITION") {
    if (signal.tier === "STARTER") return { percent: c.starterPercent, floor: c.starterFloorEur, ceiling: c.starterCeilingEur, cashCeiling: c.ordinaryOrderCashCeilingPercent };
    if (signal.tier === "STANDARD") return { percent: c.standardPercent, floor: c.standardFloorEur, ceiling: c.standardCeilingEur, cashCeiling: c.ordinaryOrderCashCeilingPercent };
    if (signal.tier === "FULL") return { percent: c.fullPercent, floor: c.fullFloorEur, ceiling: c.fullCeilingEur, cashCeiling: c.ordinaryOrderCashCeilingPercent };
  }
  if (signal.action === "ADD" && signal.tier === "ADD_THIRD") return { percent: c.addPercent, floor: c.addFloorEur, ceiling: c.addCeilingEur, cashCeiling: c.ordinaryOrderCashCeilingPercent };
  if (signal.action === "HIGH_CONVICTION_ADD" && signal.tier === "ADD_HALF") return { percent: c.highConvictionAddPercent, floor: c.highConvictionAddFloorEur, ceiling: c.highConvictionAddCeilingEur, cashCeiling: c.highConvictionOrderCashCeilingPercent };
  return null;
}

/** Pure owner illustration. Amounts are calculated from the starting free cash, then awarded by score. */
export function allocate(input: AllocationInput): AllocationResult {
  const c = ALLOCATION_CONFIG;
  const cash = cents(safe(input.freeCashEur));
  const contribution = cents(safe(input.monthlyContributionEur));
  const portfolio = cents(safe(input.portfolioValueEur));
  const reserve = Math.min(cash, Math.round(contribution * c.addReservePercentOfContribution / 100));
  const positions = new Map<string, { value: number; lastAddMonth?: string | null }>();
  for (const p of input.positions) {
    const old = positions.get(p.symbol);
    positions.set(p.symbol, { value: (old?.value ?? 0) + cents(safe(p.valueEur)), lastAddMonth: p.lastAddMonth === undefined ? old?.lastAddMonth : p.lastAddMonth });
  }
  const sorted = input.signals.map((signal, index) => ({ signal, index })).sort((a, b) => b.signal.score - a.signal.score || a.signal.symbol.localeCompare(b.signal.symbol) || a.index - b.index);
  const seen = new Set<string>();
  const suggestions: AllocationSuggestion[] = [];
  let remaining = cash;
  for (const { signal } of sorted) {
    const result = (amount: number, reason: AllocationReason, capped = false) => suggestions.push({ symbol: signal.symbol, tier: signal.tier, amountEur: eur(amount), reason, capped });
    if (seen.has(signal.symbol)) { result(0, "DUPLICATE_SIGNAL"); continue; }
    seen.add(signal.symbol);
    const rule = tierRule(signal);
    if (!rule) { result(0, "NO_BUY_SIGNAL"); continue; }
    if (!cash) { result(0, "NO_CASH"); continue; }
    const held = positions.get(signal.symbol);
    const add = signal.action === "ADD" || signal.action === "HIGH_CONVICTION_ADD";
    if (add && (!held || held.lastAddMonth === undefined || !month(signal.asOf))) { result(0, "ADD_HISTORY_UNKNOWN"); continue; }
    if (add && held?.lastAddMonth === month(signal.asOf)) { result(0, "ADD_ALREADY_THIS_MONTH"); continue; }

    const floor = Math.max(cents(rule.floor), cents(c.minimumOrderEur), c.maxFeePercent > 0 ? Math.ceil(cents(c.estimatedFeeEur) * 100 / c.maxFeePercent) : Number.POSITIVE_INFINITY);
    const requested = Math.max(Math.round(cash * rule.percent / 100), cents(rule.floor));
    const target = Math.min(requested, cents(rule.ceiling), Math.round(cash * rule.cashCeiling / 100));
    const nameCap = Math.max(0, Math.floor(portfolio * sizingCap(accountBucket(eur(portfolio))) / 100) - (held?.value ?? 0));
    const spendable = add ? remaining : Math.max(0, remaining - reserve);
    const amount = Math.min(target, nameCap, spendable);
    if (amount < floor) {
      const reason = nameCap < floor ? "NAME_CAP" : target < floor ? "BELOW_MINIMUM" : spendable < floor ? (add ? "CASH_LIMIT" : "RESERVE_LIMIT") : "BELOW_MINIMUM";
      result(0, reason, amount < target);
      continue;
    }
    remaining -= amount;
    const reason = amount < target ? nameCap <= spendable ? "NAME_CAP" : add ? "CASH_LIMIT" : "RESERVE_LIMIT" : target < requested ? "ORDER_CEILING" : "TIER_AMOUNT";
    result(amount, reason, amount < requested);
  }
  return { suggestions, carriedCashEur: eur(remaining), cashDrag: contribution > 0 && cash > contribution * c.cashDragMonths, reserveEur: eur(reserve) };
}

import { ALLOCATION_CONFIG } from "./allocation-config";
import { sizingCap, type AccountBucket } from "./sizing";
import type { SizeTier } from "./signals";
import type { HorizonProfile } from "./horizon";

export type AllocationReason =
  | "TIER_AMOUNT" | "ORDER_CEILING" | "CASH_LIMIT" | "RESERVE_LIMIT" | "NAME_CAP"
  | "BELOW_MINIMUM" | "NO_CASH" | "NO_BUY_SIGNAL" | "ADD_ALREADY_THIS_MONTH" | "ADD_HISTORY_UNKNOWN" | "DUPLICATE_SIGNAL" | "EVENT_SLEEVE_CAP"
  | "SECTOR_CAP" | "MAX_POSITIONS";
/** A holding that is already above a limit. It is reported for review; the allocator never sells. */
export type OverLimitKind = "SECTOR_CAP" | "NAME_CAP" | "MAX_POSITIONS";
export interface OverLimit { kind: OverLimitKind; /** Sector group, ticker, or "positions". */ key: string; /** Share of total portfolio value incl. cash, or the position count. */ value: number; limit: number }

/** `sector` is a sector group (src/universe/sector-groups.ts). Missing or "Unknown" means the sector cap cannot be checked for that name. */
export interface AllocationPosition { symbol: string; valueEur: number; profile?: HorizonProfile; /** null confirms no add this month; undefined means history is unknown. */ lastAddMonth?: string | null; sector?: string | null }
export interface AllocationSignal { symbol: string; tier: SizeTier; score: number; asOf: string; profile?: HorizonProfile; sector?: string | null; action: "START_POSITION" | "ADD" | "HIGH_CONVICTION_ADD" | "WATCH" | "HOLD" | "REDUCE" | "THESIS_BROKEN" | "CSPX_ALLOCATION" }
export interface AllocationInput { monthlyContributionEur: number; freeCashEur: number; recycledCashEur?: number; portfolioValueEur: number; positions: AllocationPosition[]; signals: AllocationSignal[] }
/** `sectorChecked` is false when the name has no known sector group, so the sector cap was not applied to it. */
export interface AllocationSuggestion { symbol: string; tier: SizeTier; amountEur: number; recycledEur: number; reason: AllocationReason; capped: boolean; sectorChecked: boolean }
export interface AllocationResult { suggestions: AllocationSuggestion[]; carriedCashEur: number; recycledCashEur: number; cashDrag: boolean; reserveEur: number; overLimit: OverLimit[] }

const cents = (value: number) => Math.round(value * 100);
const eur = (value: number) => value / 100;
const r1 = (value: number) => Math.round(value * 10) / 10;
const safe = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
const month = (asOf: string) => /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf.slice(0, 7) : null;
/** A named sector group, or null when the sector is missing or Unknown. */
const knownSector = (sector: string | null | undefined) => sector && sector.trim() && sector !== "Unknown" ? sector : null;
const share = (value: number, total: number) => total > 0 ? Math.round(value * 1000 / total) / 10 : 0;

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
  const positions = new Map<string, { value: number; profile?: HorizonProfile; lastAddMonth?: string | null; sector: string | null }>();
  for (const p of input.positions) {
    const old = positions.get(p.symbol);
    positions.set(p.symbol, { value: (old?.value ?? 0) + cents(safe(p.valueEur)), profile: p.profile ?? old?.profile, lastAddMonth: p.lastAddMonth === undefined ? old?.lastAddMonth : p.lastAddMonth, sector: knownSector(p.sector) ?? old?.sector ?? null });
  }
  // Sector exposure and the open-position count start from current holdings; amounts assigned below are added as the loop runs.
  const sectorValue = new Map<string, number>();
  for (const p of positions.values()) if (p.sector && p.value > 0) sectorValue.set(p.sector, (sectorValue.get(p.sector) ?? 0) + p.value);
  let openPositions = [...positions.values()].filter((p) => p.value > 0).length;
  const sectorLimit = Math.floor(portfolio * c.sectorCapPercent / 100);
  const overLimit: OverLimit[] = [
    ...[...sectorValue].filter(([, value]) => value > sectorLimit).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ kind: "SECTOR_CAP" as const, key, value: share(value, portfolio), limit: c.sectorCapPercent })),
    ...[...positions].filter(([, p]) => p.value > Math.floor(portfolio * sizingCap(accountBucket(eur(portfolio))) / 100 * (p.profile === "event" ? c.eventNameCapFraction : 1)))
      .sort((a, b) => b[1].value - a[1].value || a[0].localeCompare(b[0]))
      .map(([key, p]) => ({ kind: "NAME_CAP" as const, key, value: share(p.value, portfolio), limit: r1(sizingCap(accountBucket(eur(portfolio))) * (p.profile === "event" ? c.eventNameCapFraction : 1)) })),
    ...(openPositions > c.maxPositions ? [{ kind: "MAX_POSITIONS" as const, key: "positions", value: openPositions, limit: c.maxPositions }] : []),
  ];
  let recycled = Math.min(cash, cents(safe(input.recycledCashEur ?? 0)));
  let eventValue = [...positions.values()].filter((p) => p.profile === "event").reduce((sum, p) => sum + p.value, 0);
  const sorted = input.signals.map((signal, index) => ({ signal, index })).sort((a, b) =>
    (recycled > 0 ? Number(b.signal.profile === "sustained") - Number(a.signal.profile === "sustained") : 0) || b.signal.score - a.signal.score || a.signal.symbol.localeCompare(b.signal.symbol) || a.index - b.index);
  const seen = new Set<string>();
  const suggestions: AllocationSuggestion[] = [];
  let remaining = cash;
  for (const { signal } of sorted) {
    const held = positions.get(signal.symbol);
    const sector = held?.sector ?? knownSector(signal.sector);
    const result = (amount: number, reason: AllocationReason, capped = false, recycledUsed = 0) => suggestions.push({ symbol: signal.symbol, tier: signal.tier, amountEur: eur(amount), recycledEur: eur(recycledUsed), reason, capped, sectorChecked: sector !== null });
    if (seen.has(signal.symbol)) { result(0, "DUPLICATE_SIGNAL"); continue; }
    seen.add(signal.symbol);
    const rule = tierRule(signal);
    if (!rule) { result(0, "NO_BUY_SIGNAL"); continue; }
    if (!cash) { result(0, "NO_CASH"); continue; }
    const add = signal.action === "ADD" || signal.action === "HIGH_CONVICTION_ADD";
    const opens = !held || held.value <= 0;
    if (add && (!held || held.lastAddMonth === undefined || !month(signal.asOf))) { result(0, "ADD_HISTORY_UNKNOWN"); continue; }
    if (add && held?.lastAddMonth === month(signal.asOf)) { result(0, "ADD_ALREADY_THIS_MONTH"); continue; }
    if (opens && openPositions >= c.maxPositions) { result(0, "MAX_POSITIONS"); continue; }

    const floor = Math.max(cents(rule.floor), cents(c.minimumOrderEur), c.maxFeePercent > 0 ? Math.ceil(cents(c.estimatedFeeEur) * 100 / c.maxFeePercent) : Number.POSITIVE_INFINITY);
    const requested = Math.max(Math.round(cash * rule.percent / 100), cents(rule.floor));
    const target = Math.min(requested, cents(rule.ceiling), Math.round(cash * rule.cashCeiling / 100));
    const nameFraction = signal.profile === "event" ? c.eventNameCapFraction : 1;
    const nameCap = Math.max(0, Math.floor(portfolio * sizingCap(accountBucket(eur(portfolio))) / 100 * nameFraction) - (held?.value ?? 0));
    const sleeveCap = signal.profile === "event" ? Math.max(0, Math.floor(portfolio * c.eventSleeveCapPercent / 100) - eventValue) : Number.POSITIVE_INFINITY;
    const sectorCap = sector ? Math.max(0, sectorLimit - (sectorValue.get(sector) ?? 0)) : Number.POSITIVE_INFINITY;
    const spendable = add ? remaining : Math.max(0, remaining - reserve);
    const amount = Math.min(target, nameCap, sleeveCap, sectorCap, spendable);
    if (amount < floor) {
      const reason = sleeveCap < floor ? "EVENT_SLEEVE_CAP" : nameCap < floor ? "NAME_CAP" : sectorCap < floor ? "SECTOR_CAP" : target < floor ? "BELOW_MINIMUM" : spendable < floor ? (add ? "CASH_LIMIT" : "RESERVE_LIMIT") : "BELOW_MINIMUM";
      result(0, reason, amount < target);
      continue;
    }
    const ordinaryAvailable = remaining - recycled;
    remaining -= amount;
    if (signal.profile === "event") eventValue += amount;
    if (sector) sectorValue.set(sector, (sectorValue.get(sector) ?? 0) + amount);
    if (opens) openPositions += 1;
    const recycledUsed = signal.profile === "sustained" ? Math.min(amount, recycled) : Math.min(recycled, Math.max(0, amount - ordinaryAvailable));
    recycled -= recycledUsed;
    const reason = amount < target ? sleeveCap <= nameCap && sleeveCap <= sectorCap && sleeveCap <= spendable ? "EVENT_SLEEVE_CAP" : nameCap <= sectorCap && nameCap <= spendable ? "NAME_CAP" : sectorCap <= spendable ? "SECTOR_CAP" : add ? "CASH_LIMIT" : "RESERVE_LIMIT" : target < requested ? "ORDER_CEILING" : "TIER_AMOUNT";
    result(amount, reason, amount < requested, recycledUsed);
  }
  return { suggestions, carriedCashEur: eur(remaining), recycledCashEur: eur(recycled), cashDrag: contribution > 0 && cash > contribution * c.cashDragMonths, reserveEur: eur(reserve), overLimit };
}

/** Quality filters for weekly discovery (DS1): security type by name, SIC and filer type, then market cap and liquidity from bars. No I/O except the SEC reads in loadSecProfile. */
import type { OHLCV } from "../engine/types";
import { filerType, isCommonStock } from "../universe/select";
import { DISCOVERY } from "./discovery-config";

export interface QualityCriteria { minMarketCapUsd: number; minAvgDollarVolumeUsd: number; avgDollarVolumeDays: number; excludedSic: readonly string[] }

const NAME_RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: /(?:^|[\s,])L\.?\s?P\.?$|\blimited partnership\b|\bL\.?L\.?L\.?P\.?$|\bmaster limited\b|\bMLP\b/i, reason: "limited partnership (LP or MLP)" },
  { pattern: /\bco-?operative\b|\bcoop\b|\bsoybean\b.*\bprocessors?\b|\bfarmers\b.*\b(?:union|association)\b/i, reason: "cooperative or processor-owned entity" },
  { pattern: /(?:^|[\s,])L\.?L\.?C\.?$/i, reason: "LLC membership units" },
  { pattern: /\bacquisition\s+(?:corp|corporation|co|company|inc|ltd|limited|holdings)\b|\bblank check\b|\bSPAC\b/i, reason: "SPAC (blank check company)" },
  { pattern: /\b(?:ADR|ADRs|ADS|american depositary|depositary (?:shares|receipts))\b/i, reason: "ADR or depositary shares" },
];

/** First matching exclusion for an issuer name, or null. Covers warrants, units, rights, preferreds and trusts through the D35 common-stock check. */
export function nameExclusion(symbol: string, name: string): string | null {
  for (const { pattern, reason } of NAME_RULES) if (pattern.test(name)) return reason;
  if (!isCommonStock({ ticker: symbol, name })) return "not common stock (warrant, unit, right, preferred, notes, ETF or trust)";
  return null;
}

export interface SecProfile { name: string | null; sic: string | null; sicDescription: string | null; forms: string[]; sharesOutstanding: number | null }

/** Exclusion from the SEC submissions facts: SIC code, foreign filer (20-F, 40-F, 6-K only) and the SEC registered name. */
export function profileExclusion(symbol: string, profile: SecProfile, k: Pick<QualityCriteria, "excludedSic"> = DISCOVERY): string | null {
  if (profile.sic && k.excludedSic.includes(profile.sic)) return `SIC ${profile.sic}${profile.sicDescription ? ` ${profile.sicDescription}` : ""}`;
  if (filerType(profile.forms) === "foreign") return "foreign filer (ADR or foreign issuer)";
  return profile.name ? nameExclusion(symbol, profile.name) : null;
}

const usd = (value: number) => `$${(value / 1e6).toFixed(1)}M`;

/** Market cap (last close times shares outstanding) and average dollar volume floors. Returns the first failed floor, or null. */
export function liquidityReason(bars: OHLCV[], sharesOutstanding: number | null, k: QualityCriteria = DISCOVERY): string | null {
  const recent = bars.slice(-k.avgDollarVolumeDays);
  const last = recent.at(-1);
  if (!last) return "no price bars";
  if (sharesOutstanding === null || !(sharesOutstanding > 0)) return "market cap unknown (no shares outstanding in SEC data)";
  const marketCap = last.close * sharesOutstanding;
  if (marketCap < k.minMarketCapUsd) return `market cap ${usd(marketCap)} below ${usd(k.minMarketCapUsd)}`;
  const avg = recent.reduce((sum, bar) => sum + bar.close * bar.volume, 0) / recent.length;
  if (avg < k.minAvgDollarVolumeUsd) return `average dollar volume ${usd(avg)} below ${usd(k.minAvgDollarVolumeUsd)}`;
  return null;
}

type Get = (url: string) => Promise<string>;
const pad = (cik: number) => String(cik).padStart(10, "0");

/** Latest reported share count: the cover page value first, then the balance sheet value. Null when SEC has neither. */
async function sharesOutstanding(cik: number, get: Get): Promise<number | null> {
  for (const concept of ["dei/EntityCommonStockSharesOutstanding", "us-gaap/CommonStockSharesOutstanding"]) {
    try {
      const body = JSON.parse(await get(`https://data.sec.gov/api/xbrl/companyconcept/CIK${pad(cik)}/${concept}.json`)) as { units?: { shares?: { end?: string; filed?: string; val?: number }[] } };
      const rows = (body.units?.shares ?? []).filter((row) => typeof row.val === "number" && row.val > 0 && row.end);
      rows.sort((a, b) => `${b.end}${b.filed ?? ""}`.localeCompare(`${a.end}${a.filed ?? ""}`));
      if (rows[0]) return rows[0].val as number;
    } catch { /* missing concept: try the next one */ }
  }
  return null;
}

/** One submissions read and up to two company-concept reads per candidate. A failed submissions read throws so the caller can report it. */
export async function loadSecProfile(cik: number, get: Get): Promise<SecProfile> {
  const sub = JSON.parse(await get(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`)) as { name?: string; sic?: string; sicDescription?: string; filings?: { recent?: { form?: string[] } } };
  return { name: sub.name ?? null, sic: sub.sic ? String(sub.sic) : null, sicDescription: sub.sicDescription ?? null,
    forms: sub.filings?.recent?.form ?? [], sharesOutstanding: await sharesOutstanding(cik, get) };
}

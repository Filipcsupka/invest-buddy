import type { Fundamentals, Macro, OHLCV } from "@/engine";
import type { Instrument, UniverseProvider } from "./providers";

const named: [string, string, string, 1 | 2 | 3 | null][] = [
  ["NVDA", "NVIDIA", "AI & semiconductors", 1], ["AMD", "AMD", "AI & semiconductors", null], ["AVGO", "Broadcom", "AI & semiconductors", 1], ["SMCI", "Super Micro Computer", "AI & semiconductors", 2], ["PLTR", "Palantir", "AI & semiconductors", 2], ["GOOGL", "Alphabet", "AI & semiconductors", null],
  ["AMZN", "Amazon", "Cloud & SaaS", 1], ["MSFT", "Microsoft", "Cloud & SaaS", 1], ["SNOW", "Snowflake", "Cloud & SaaS", 2], ["NET", "Cloudflare", "Cloud & SaaS", 2], ["DDOG", "Datadog", "Cloud & SaaS", 1], ["CRM", "Salesforce", "Cloud & SaaS", null],
  ["CRWD", "CrowdStrike", "Cybersecurity", 1], ["PANW", "Palo Alto Networks", "Cybersecurity", null], ["ZS", "Zscaler", "Cybersecurity", null], ["OKTA", "Okta", "Cybersecurity", null],
  ["SQ", "Block", "Fintech", null], ["AFRM", "Affirm", "Fintech", 3], ["PYPL", "PayPal", "Fintech", null],
  ["VRTX", "Vertex Pharmaceuticals", "Biotech", null], ["CRSP", "CRISPR Therapeutics", "Biotech", null], ["REGN", "Regeneron", "Biotech", null],
  ["TSLA", "Tesla", "Energy & EV", 2], ["ENPH", "Enphase Energy", "Energy & EV", 3],
  ["ROKU", "Roku", "Additional growth", 3], ["SHOP", "Shopify", "Additional growth", 3], ["SE", "Sea", "Additional growth", 3], ["MELI", "MercadoLibre", "Additional growth", null],
];
const extensions: [string, string, string, 1 | 2 | 3 | null][] = [
  ["META", "Meta Platforms", "Sample extension", null],
  ["AAPL", "Apple", "Sample extension", null],
  ["UBER", "Uber", "Sample extension", null],
  ["ASML", "ASML", "Sample extension", null],
  ["ORCL", "Oracle", "Sample extension", null],
  ["NOW", "ServiceNow", "Sample extension", null],
  ["MDB", "MongoDB", "Sample extension", null],
];
export const instruments: Instrument[] = [
  ...named.map(([ticker, name, sector, tier]) => ({ ticker, name, sector, tier, source: "guide" as const })),
  ...extensions.map(([ticker, name, sector, tier]) => ({ ticker, name, sector, tier, source: "sample extension" as const })),
];

function hash(text: string) { return [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7); }
function date(day: number) { const d = new Date(Date.UTC(2025, 0, 1 + day)); return d.toISOString().slice(0, 10); }
export function fixtureBars(ticker: string): OHLCV[] {
  const seed = hash(ticker);
  const profile = seed % 7;
  const base = 60 + seed % 140;
  return Array.from({ length: 220 }, (_, day) => {
    let close = base + day * (profile === 6 ? -0.13 : 0.18 + (seed % 5) * 0.045) + Math.sin(day / 6 + seed) * 1.5;
    if (day >= 200 && profile % 3 === 0) close -= (day - 199) * 0.5;
    if (day >= 210 && profile % 3 === 1) close -= (day - 209) * 0.28;
    const green = (day + seed) % 3 !== 0;
    const open = close + (green ? -0.9 : 0.9);
    return { date: date(day), open: Number(open.toFixed(2)), high: Number((Math.max(open, close) + 0.8).toFixed(2)), low: Number((Math.min(open, close) - 0.8).toFixed(2)), close: Number(close.toFixed(2)), volume: green ? 1_700_000 + seed % 300_000 : 850_000 + seed % 200_000 };
  });
}
export function fixtureFundamentals(ticker: string): Fundamentals {
  const seed = hash(ticker);
  const weak = seed % 11 === 0;
  return { revenueGrowthCurrent: weak ? -2 : 17 + seed % 15, revenueGrowthPrior: 11 + seed % 10, revenueDeclining: weak, epsBeat: seed % 4 !== 0, guidanceRaised: seed % 5 === 0, earningsMissAndGuidanceCut: seed % 17 === 0, productCatalyst: seed % 3 !== 0, insiderOrInstitutionalAccumulation: seed % 2 === 0, noRevenue: false, memePump: false };
}
export function fixtureMacro(ticker: string): Macro { const seed = hash(ticker); return { growthSectorRotation: seed % 4 !== 0, dataTailwind: seed % 3 !== 0 }; }
export const fixtureProvider: UniverseProvider = {
  async instruments() { return instruments; },
  async bars(ticker) { return fixtureBars(ticker); },
  async fundamentals(ticker) { return fixtureFundamentals(ticker); },
  async macro(ticker) { return fixtureMacro(ticker); },
};

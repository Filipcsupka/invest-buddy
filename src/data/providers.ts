import type { Fundamentals, Macro, OHLCV } from "@/engine";
export interface MarketDataProvider { bars(ticker: string): Promise<OHLCV[]> }
export interface FundamentalsProvider { fundamentals(ticker: string): Promise<Fundamentals> }
export interface MacroProvider { macro(ticker: string): Promise<Macro> }
export interface Instrument { ticker: string; name: string; sector: string; tier: 1 | 2 | 3 | null; source: "guide" | "sample extension" | "discovery" }
export interface UniverseProvider extends MarketDataProvider, FundamentalsProvider, MacroProvider { instruments(): Promise<Instrument[]> }

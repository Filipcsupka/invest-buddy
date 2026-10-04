import type { ScanPayload } from "../data/scan";
import { macroEvidenceFlags, tickerEvidenceFlags } from "../data/scan";
import type { IngestResult } from "./scan";

export interface StoredFinding {
  runId: string; asOf: string; symbol: string; fundamentals: ScanPayload["tickers"][number]["fundamentals"];
  evidence: { items: ScanPayload["tickers"][number]["evidence"]; flags: Record<string, boolean> };
  confidence: ScanPayload["tickers"][number]["confidence"]; runner: ScanPayload["runner"];
  receivedAt: string; supersededBy: string | null;
}
export class MemoryScanRepository {
  readonly runs = new Map<string, ScanPayload>();
  readonly findings: StoredFinding[] = [];
  readonly macroFindings: { runId: string; asOf: string; data: ScanPayload["macro"]; evidence: { items: ScanPayload["macro"]["evidence"]; flags: Record<string, boolean> }; supersededBy: string | null }[] = [];
  constructor(private readonly instruments: Set<string>) {}
  ingest(payload: ScanPayload): IngestResult {
    if (this.runs.has(payload.runId)) return { accepted: 0, rejected: [], replayed: true };
    this.runs.set(payload.runId, structuredClone(payload));
    const rejected = payload.tickers.filter((item) => !this.instruments.has(item.symbol)).map((item) => ({ symbol: item.symbol, reason: "Unknown instrument" }));
    for (const item of payload.tickers.filter((ticker) => this.instruments.has(ticker.symbol))) {
      for (const prior of this.findings) if (prior.symbol === item.symbol && prior.asOf === payload.asOf && prior.supersededBy === null) prior.supersededBy = payload.runId;
      this.findings.push({ runId: payload.runId, asOf: payload.asOf, symbol: item.symbol, fundamentals: structuredClone(item.fundamentals), evidence: { items: structuredClone(item.evidence), flags: tickerEvidenceFlags(item) }, confidence: item.confidence, runner: structuredClone(payload.runner), receivedAt: new Date().toISOString(), supersededBy: null });
    }
    for (const prior of this.macroFindings) if (prior.asOf === payload.asOf && prior.supersededBy === null) prior.supersededBy = payload.runId;
    this.macroFindings.push({ runId: payload.runId, asOf: payload.asOf, data: structuredClone(payload.macro), evidence: { items: structuredClone(payload.macro.evidence), flags: macroEvidenceFlags(payload.macro) }, supersededBy: null });
    return { accepted: payload.tickers.length - rejected.length, rejected, replayed: false };
  }
  latest(symbol: string) { return [...this.findings].filter((item) => item.symbol === symbol && item.supersededBy === null).sort((a, b) => b.asOf.localeCompare(a.asOf) || b.receivedAt.localeCompare(a.receivedAt))[0] ?? null; }
}

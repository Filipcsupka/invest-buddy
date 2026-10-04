import type { ScanPayload } from "../data/scan";
import { macroEvidenceFlags, tickerEvidenceFlags } from "../data/scan";
import type { IngestResult } from "./scan";
import { fields, reconcileField, type ConsensusField } from "../jobs/reconcile";
import type { EvidenceVerifier } from "../data/evidence";
import type { RevenueResult } from "../data/sec";

export interface StoredFinding {
  runId: string; asOf: string; symbol: string; fundamentals: ScanPayload["tickers"][number]["fundamentals"];
  evidence: { items: ScanPayload["tickers"][number]["evidence"]; flags: Record<string, boolean> };
  confidence: ScanPayload["tickers"][number]["confidence"]; runner: ScanPayload["runner"];
  receivedAt: string; supersededBy: string | null;
}
export class MemoryScanRepository {
  readonly runs = new Map<string, ScanPayload>();
  readonly consensus: ConsensusField[] = [];
  readonly findings: StoredFinding[] = [];
  readonly macroFindings: { runId: string; asOf: string; data: ScanPayload["macro"] & { runnerName: string }; evidence: { items: ScanPayload["macro"]["evidence"]; flags: Record<string, boolean> }; supersededBy: string | null }[] = [];
  constructor(private readonly instruments: Set<string>) {}
  ingest(payload: ScanPayload): IngestResult {
    if (this.runs.has(payload.runId)) return { accepted: 0, rejected: [], replayed: true };
    this.runs.set(payload.runId, structuredClone(payload));
    const rejected = payload.tickers.filter((item) => !this.instruments.has(item.symbol)).map((item) => ({ symbol: item.symbol, reason: "Unknown instrument" }));
    for (const item of payload.tickers.filter((ticker) => this.instruments.has(ticker.symbol))) {
      for (const prior of this.findings) if (prior.symbol === item.symbol && prior.asOf === payload.asOf && prior.runner.name === payload.runner.name && prior.supersededBy === null) prior.supersededBy = payload.runId;
      this.findings.push({ runId: payload.runId, asOf: payload.asOf, symbol: item.symbol, fundamentals: structuredClone(item.fundamentals), evidence: { items: structuredClone(item.evidence), flags: tickerEvidenceFlags(item) }, confidence: item.confidence, runner: structuredClone(payload.runner), receivedAt: new Date().toISOString(), supersededBy: null });
    }
    for (const prior of this.macroFindings) if (prior.asOf === payload.asOf && prior.data.runnerName === payload.runner.name && prior.supersededBy === null) prior.supersededBy = payload.runId;
    this.macroFindings.push({ runId: payload.runId, asOf: payload.asOf, data: { ...structuredClone(payload.macro), runnerName: payload.runner.name }, evidence: { items: structuredClone(payload.macro.evidence), flags: macroEvidenceFlags(payload.macro) }, supersededBy: null });
    return { accepted: payload.tickers.length - rejected.length, rejected, replayed: false };
  }
  async reconcile(asOf: string, verify: EvidenceVerifier, secLookup: (symbol: string) => Promise<RevenueResult | null> = async () => null) {
    const current = this.findings.filter((item) => item.asOf === asOf && item.supersededBy === null);
    const symbols = [...new Set(current.map((item) => item.symbol))];
    for (const symbol of symbols) {
      const sec = await secLookup(symbol);
      const findings = current.filter((item) => item.symbol === symbol).map((item) => ({ runId: item.runId, runner: item.runner, fundamentals: item.fundamentals, evidence: item.evidence, confidence: item.confidence }));
      const macro = this.macroFindings.filter((item) => item.asOf === asOf && item.supersededBy === null).map((item) => ({ runId: item.runId, runner: { name: item.data.runnerName as "claude" | "codex" }, fundamentals: item.data, evidence: item.evidence, confidence: "high" }));
      for (const field of fields) {
        const result = await reconcileField(symbol, field, asOf, field === "sectorRotationIntoGrowth" || field === "dataTailwind" ? macro : findings, verify, sec);
        const old = this.consensus.findIndex((item) => item.symbol === symbol && item.field === field && item.asOf === asOf);
        if (old >= 0) this.consensus[old] = result; else this.consensus.push(result);
      }
    }
    return this.consensus.filter((item) => item.asOf === asOf).length;
  }
  latestConsensus(symbol: string, field: string) { return [...this.consensus].filter((item) => item.symbol === symbol && item.field === field).sort((a,b) => b.asOf.localeCompare(a.asOf))[0] ?? null; }
  latest(symbol: string) { return [...this.findings].filter((item) => item.symbol === symbol && item.supersededBy === null).sort((a, b) => b.asOf.localeCompare(a.asOf) || b.receivedAt.localeCompare(a.receivedAt))[0] ?? null; }
}

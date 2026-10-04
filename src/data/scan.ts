import { z } from "zod";

const date = z.iso.date();
const evidence = z.object({ claim: z.string().regex(/^(fundamentals|macro)\.[A-Za-z]+$/), url: z.url().max(2048).refine((value) => value.startsWith("https://"), "HTTPS URL required"), publishedAt: date.optional() }).strict();
const nullable = z.boolean().nullable();
export const scanSchema = z.object({
  schemaVersion: z.literal(1), runId: z.uuid(), asOf: date, generatedAt: z.iso.datetime({ offset: true }),
  runner: z.object({ name: z.string().min(1).max(64), model: z.string().min(1).max(128) }).strict(),
  tickers: z.array(z.object({
    symbol: z.string().regex(/^[A-Z][A-Z0-9.-]{0,9}$/),
    fundamentals: z.object({
      revenueAccelerating: nullable, revenueDeclining: nullable, epsBeat: nullable, guidanceRaised: nullable,
      guidanceCut: nullable, productCatalyst: z.object({ present: z.boolean(), kind: z.string().max(80).nullable(), summary: z.string().max(300).nullable() }).strict().nullable(),
      insiderOrInstitutionalBuying: nullable, narrativeChanged: nullable,
    }).strict(), evidence: z.array(evidence).max(20), confidence: z.enum(["high", "medium", "low"]),
  }).strict()).superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => { if (seen.has(item.symbol)) context.addIssue({ code: "custom", path: [index, "symbol"], message: "Duplicate symbol" }); seen.add(item.symbol); });
  }),
  macro: z.object({ sectorRotationIntoGrowth: nullable, dataTailwind: nullable, notes: z.string().max(500), evidence: z.array(evidence).max(20), events: z.array(z.object({ date, name: z.string().min(1).max(120) }).strict()).max(30) }).strict(),
}).strict();
export type ScanPayload = z.infer<typeof scanSchema>;
export type ScanTicker = ScanPayload["tickers"][number];
export function evidenceFlags(claims: Record<string, boolean | null>, entries: { claim: string; url: string }[]) {
  return Object.fromEntries(Object.entries(claims).filter(([, value]) => value === true).map(([claim]) => [claim, entries.some((item) => item.claim === claim && item.url.startsWith("https://"))]));
}
export function tickerEvidenceFlags(item: ScanTicker) {
  const f = item.fundamentals;
  return evidenceFlags({
    "fundamentals.revenueAccelerating": f.revenueAccelerating, "fundamentals.revenueDeclining": f.revenueDeclining,
    "fundamentals.epsBeat": f.epsBeat, "fundamentals.guidanceRaised": f.guidanceRaised,
    "fundamentals.guidanceCut": f.guidanceCut, "fundamentals.productCatalyst": f.productCatalyst?.present ?? null,
    "fundamentals.insiderOrInstitutionalBuying": f.insiderOrInstitutionalBuying,
    "fundamentals.narrativeChanged": f.narrativeChanged,
  }, item.evidence);
}
export function macroEvidenceFlags(macro: ScanPayload["macro"]) {
  return evidenceFlags({ "macro.sectorRotationIntoGrowth": macro.sectorRotationIntoGrowth, "macro.dataTailwind": macro.dataTailwind }, macro.evidence);
}

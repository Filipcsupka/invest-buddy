import { randomUUID } from "node:crypto";
import { scanSchema } from "../src/data/scan";

const url = process.env.INGEST_URL ?? "http://localhost:3000/api/ingest/scan";
const token = process.env.INGEST_TOKEN ?? "local-dev-token";
const asOf = process.env.SCAN_AS_OF ?? new Date().toISOString().slice(0, 10);
const source = "https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx";
const evidence = (field: string) => ({ claim: `fundamentals.${field}`, url: source, publishedAt: asOf, fiscalPeriod: "Q2 FY2027", quote: "NVIDIA announced revenue growth in its latest quarterly results." });
async function main() {
  for (const name of ["claude", "codex"] as const) {
    const payload = scanSchema.parse({
      schemaVersion: 2, runId: randomUUID(), asOf, generatedAt: new Date().toISOString(), runner: { name, model: "local-sample", dataMode: "sample" },
      tickers: [{ symbol: "NVDA", fundamentals: {
        revenueAccelerating: true, revenueDeclining: false, epsBeat: name === "claude", guidanceRaised: false, guidanceCut: false,
        productCatalyst: { present: false, kind: null, summary: null }, insiderOrInstitutionalBuying: null, narrativeChanged: null,
      }, evidence: ["revenueAccelerating", ...(name === "claude" ? ["epsBeat"] : [])].map(evidence), confidence: "high" }],
      macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "No confirmed macro signal in this local sample.", evidence: [], events: [] },
    });
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
    process.stdout.write(`${name}: ${response.status} ${await response.text()}\n`);
    if (!response.ok) process.exitCode = 1;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

import { randomUUID } from "node:crypto";
import { scanSchema } from "../src/data/scan";

const url = process.env.INGEST_URL ?? "http://localhost:3000/api/ingest/scan";
const token = process.env.INGEST_TOKEN ?? "local-dev-token";
const asOf = process.env.SCAN_AS_OF ?? new Date().toISOString().slice(0, 10);
const source = "https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx";
const payload = scanSchema.parse({
  schemaVersion: 1, runId: randomUUID(), asOf, generatedAt: new Date().toISOString(), runner: { name: "local-sample", model: "manual-example" },
  tickers: [{ symbol: "NVDA", fundamentals: {
    revenueAccelerating: true, revenueDeclining: false, epsBeat: true, guidanceRaised: true, guidanceCut: false,
    productCatalyst: { present: false, kind: null, summary: null }, insiderOrInstitutionalBuying: null, narrativeChanged: null,
  }, evidence: ["revenueAccelerating", "epsBeat", "guidanceRaised"].map((field) => ({ claim: `fundamentals.${field}`, url: source })), confidence: "high" }],
  macro: { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "No macro claim in this local sample.", evidence: [], events: [] },
});
async function main() {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  process.stdout.write(`${response.status} ${await response.text()}\n`);
  if (!response.ok) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

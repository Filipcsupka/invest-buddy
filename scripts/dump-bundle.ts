// Local helper: collect one ticker from live free sources into memory (no database) and write the
// bundle JSON the extractor expects, with the same window, order and displayAllowed rules as the bundle route.
// Usage: SEC_USER_AGENT="..." npx tsx scripts/dump-bundle.ts NVDA out-dir [YYYY-MM-DD as-of date]
import { writeFileSync, mkdirSync } from "node:fs";
import { runCollect } from "../src/jobs/collect";
import { MemoryCollectorRepository } from "../src/db/collectors";
import { selectExcerpts, displayAllowedFor, withinWindow, MAX_WINDOW_DAYS } from "../src/db/bundle";

async function main() {
  const [symbol, dir, asOfArg] = process.argv.slice(2);
  const asOf = asOfArg ?? new Date().toISOString().slice(0, 10);
  if (!symbol || !dir) throw new Error("usage: dump-bundle.ts SYMBOL OUT_DIR");
  const repo = new MemoryCollectorRepository();
  const since = new Date(Date.parse(`${asOf}T00:00:00Z`) - MAX_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const run = await runCollect(repo, [symbol], { sources: ["edgar"], since });
  console.error(JSON.stringify({ succeeded: run.succeeded, documents: run.documentsParsed, facts: run.factsComputed, failures: run.failures }));
  const docs = [...repo.documents.values()].map((d) => ({ id: d.id, url: d.url, source: d.source, docType: d.docType, publishedAt: d.publishedAt, displayAllowed: displayAllowedFor(d.source, d.meta), body: d.body })).filter((d) => withinWindow(d, asOf)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id - b.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${symbol}.json`, JSON.stringify({ symbol, generatedAt: new Date().toISOString(), since, documents: selectExcerpts(docs), facts: [...repo.facts.values()].map((f) => ({ key: f.key, asOf: f.asOf, value: f.value, documentIds: f.documentIds })) }));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });

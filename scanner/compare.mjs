#!/usr/bin/env node
// Local cross-check of two dry-run payloads (one per agent). Read-only; prints to stdout.
// Usage: node scanner/compare.mjs <claude-payload.json> <codex-payload.json> [--verify-quotes]
// --verify-quotes fetches each cited https page and checks that the quote appears in it
// (whitespace and case normalised, HTML tags stripped). Pages that need JavaScript or block bots show as "unfetched".
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const verify = args.includes("--verify-quotes");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length !== 2) { console.error("usage: compare.mjs <payloadA.json> <payloadB.json> [--verify-quotes]"); process.exit(2); }
const A = JSON.parse(readFileSync(files[0], "utf8")), B = JSON.parse(readFileSync(files[1], "utf8"));
const nameA = `${A.runner.name}`, nameB = B.runner.name === A.runner.name ? `${B.runner.name}#2` : B.runner.name;

const show = (v) => (v === null || v === undefined ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v));
const norm = (s) => String(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;|’/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|“|”/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

const pageCache = new Map();
async function page(url) {
  if (!pageCache.has(url)) {
    pageCache.set(url, fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (investbuddy-compare)" }, signal: AbortSignal.timeout(30000), redirect: "follow" })
      .then(async (r) => (r.ok ? norm(await r.text()) : null)).catch(() => null));
  }
  return pageCache.get(url);
}
async function quoteStatus(e) {
  if (!verify) return "";
  const text = await page(e.url);
  if (text === null) return " [unfetched]";
  return text.includes(norm(e.quote)) ? " [quote found]" : " [quote NOT found]";
}

const counts = { agree: 0, disagree: 0, oneNull: 0 };
function row(label, a, b) {
  let tag;
  if (show(a) === show(b)) { tag = "AGREE"; counts.agree++; }
  else if (a === null || b === null) { tag = "ONE-NULL"; counts.oneNull++; }
  else { tag = "DISAGREE"; counts.disagree++; }
  console.log(`  ${tag.padEnd(8)} ${label.padEnd(36)} ${nameA}=${show(a)}  ${nameB}=${show(b)}`);
}
async function evidence(label, payload, list, name) {
  for (const e of list) {
    console.log(`    ${name} ${e.claim} | ${e.publishedAt ?? "-"} | ${e.fiscalPeriod ?? "-"} | ${e.url}${await quoteStatus(e)}`);
    if (e.quote) console.log(`      "${e.quote.slice(0, 220)}${e.quote.length > 220 ? "..." : ""}"`);
  }
}

console.log(`${nameA}: model=${A.runner.model} asOf=${A.asOf}   ${nameB}: model=${B.runner.model} asOf=${B.asOf}`);
if (A.asOf !== B.asOf) console.log("WARNING: asOf differs, results are not comparable");

for (const ta of A.tickers) {
  const tb = B.tickers.find((t) => t.symbol === ta.symbol);
  console.log(`\n${ta.symbol}`);
  if (!tb) { console.log(`  only in ${nameA}`); continue; }
  for (const k of Object.keys(ta.fundamentals)) {
    if (k === "productCatalyst") row(`${k}.present`, ta.fundamentals[k]?.present ?? null, tb.fundamentals[k]?.present ?? null);
    else row(k, ta.fundamentals[k], tb.fundamentals[k]);
  }
  row("confidence", ta.confidence, tb.confidence);
  const urlsA = new Set(ta.evidence.map((e) => e.url)), urlsB = new Set(tb.evidence.map((e) => e.url));
  const shared = [...urlsA].filter((u) => urlsB.has(u));
  console.log(`  evidence: ${nameA} ${ta.evidence.length} items, ${nameB} ${tb.evidence.length} items, ${shared.length} shared URLs`);
  await evidence(ta.symbol, A, ta.evidence, nameA);
  await evidence(ta.symbol, B, tb.evidence, nameB);
}
for (const tb of B.tickers) if (!A.tickers.some((t) => t.symbol === tb.symbol)) console.log(`\n${tb.symbol}\n  only in ${nameB}`);

console.log("\nmacro");
row("sectorRotationIntoGrowth", A.macro.sectorRotationIntoGrowth, B.macro.sectorRotationIntoGrowth);
row("dataTailwind", A.macro.dataTailwind, B.macro.dataTailwind);
const evA = new Set(A.macro.events.map((e) => `${e.date} ${e.name}`)), evB = new Set(B.macro.events.map((e) => `${e.date} ${e.name}`));
console.log(`  events: ${nameA} ${evA.size}, ${nameB} ${evB.size}, identical ${[...evA].filter((x) => evB.has(x)).length}`);
console.log(`  notes ${nameA}: ${A.macro.notes}\n  notes ${nameB}: ${B.macro.notes}`);

console.log(`\nfields: ${counts.agree} agree, ${counts.disagree} disagree, ${counts.oneNull} one null`);

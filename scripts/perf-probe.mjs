#!/usr/bin/env node
// Repeatable TTFB probe for the public pages. No dependencies, read-only GETs.
// Usage: node scripts/perf-probe.mjs [--base https://host] [--runs 10] [--out file.json]
// Defaults: base http://localhost:3000, 10 runs per URL. Prints JSON per URL: the first (cold) request and p50/p95 TTFB of the rest (warm).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const PATHS = ["", "/dashboard", "/company/NVDA", "/company/AMD", "/track-record", "/methodology"];
export const LOCALES = ["en", "sk"];

export function urlList(base) {
  const root = base.replace(/\/+$/, "");
  return LOCALES.flatMap((l) => PATHS.map((p) => `${root}/${l}${p}`));
}

// Nearest-rank percentile on an unsorted list. p in 0..100. Empty list gives null.
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarize(samples) {
  const ok = samples.filter((s) => s.status > 0);
  const ttfb = ok.map((s) => s.ttfbMs);
  const total = ok.map((s) => s.totalMs);
  const status = {};
  for (const s of samples) status[s.status] = (status[s.status] ?? 0) + 1;
  const r = (n) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    n: samples.length,
    status,
    ttfbP50: r(percentile(ttfb, 50)),
    ttfbP95: r(percentile(ttfb, 95)),
    totalP50: r(percentile(total, 50)),
    totalP95: r(percentile(total, 95)),
  };
}

async function sample(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "investbuddy-perf-probe" } });
    const ttfbMs = performance.now() - t0;
    await res.arrayBuffer();
    return { status: res.status, ttfbMs, totalMs: performance.now() - t0 };
  } catch {
    return { status: 0, ttfbMs: 0, totalMs: performance.now() - t0 };
  }
}

export async function probe(base, runs) {
  const results = {};
  for (const url of urlList(base)) {
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(await sample(url));
    // First request per URL is cold (empty cache, cold connection); report it apart from the warm ones.
    results[new URL(url).pathname] = { cold: samples[0], warm: summarize(samples.slice(1)) };
  }
  return results;
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = arg("--base", "http://localhost:3000");
  const runs = Number(arg("--runs", "10"));
  const out = arg("--out", "");
  const report = { base, runs, at: new Date().toISOString(), results: await probe(base, runs) };
  const text = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, text + "\n");
  console.log(text);
}

import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

// Every EODHD entrypoint is picked up here. Test files are not runtime jobs.
const regularJobs = [
  "daily.ts",
  "prices.ts",
  "reconcile.ts",
  "digest.ts",
  "weekly.ts",
  "portfolio.ts",
  "collect.ts",
  "detect.ts",
  "watch.ts",
  "retention.ts",
  "macro.ts",
  "discovery.ts",
  "dq.ts",
  "dq-corporate-actions.ts",
  "backfill.ts",
  "companyfacts.ts",
  "pool-bars.ts",
  "universe-promote.ts",
  "discovery-auto-promote.ts",
  "earnings-calendar.ts",
  "master-refresh.ts",
  "thirteenf.ts",
  "outcomes.ts",
  "etf-outcomes.ts",
  "etf-catalog.ts",
  "symbols-sync.ts",
  "alert-test.ts",
  "watchdog.ts",
  "horizon-labels.ts",
  "macro-calendar.ts"
];
const eodhdJobs = readdirSync("src/jobs").filter((name) => /^eodhd-.*\.ts$/.test(name) && !name.endsWith(".test.ts"));
rmSync("dist/jobs", { recursive: true, force: true });
await build({
  entryPoints: [...new Set([...regularJobs, ...eodhdJobs])].map((name) => resolve("src/jobs", name)),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
  tsconfig: "tsconfig.json",
  outdir: "dist/jobs",
});
// Operator scripts that run as one-off Jobs from the app image (universe selection and changes).
rmSync("dist/scripts", { recursive: true, force: true });
await build({
  entryPoints: ["select-universe.ts", "universe-change.ts", "universe-backdate.ts"].map((name) => resolve("scripts", name)),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
  tsconfig: "tsconfig.json",
  outdir: "dist/scripts",
});

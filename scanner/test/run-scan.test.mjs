import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../run-scan.mjs";

test("macro-only parses with a model and turn cap", () => {
  const opts = parseArgs(["--macro-only", "--agent", "claude", "--model", "sonnet", "--max-turns", "10", "--dry-run"]);
  assert.equal(opts.macroOnly, true);
  assert.equal(opts.model, "sonnet");
  assert.equal(opts.maxTurns, 10);
  assert.equal(opts.only, null);
});

test("macro-only dry run calls one model session and writes no tickers", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, readdirSync, chmodSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "macro-only-"));
  try {
    const fake = join(dir, "claude");
    const marker = join(dir, "args");
    const macro = { sectorRotationIntoGrowth: null, dataTailwind: null, notes: "No data", evidence: [], events: [] };
    const envelope = { result: JSON.stringify(macro), num_turns: 1, modelUsage: { "claude-sonnet": {} } };
    writeFileSync(fake, `#!/bin/sh\nif [ "$1" = '--help' ]; then printf '%s\\n' '--max-turns'; exit 0; fi\nprintf '%s\\n' "$@" > '${marker}'\nprintf '%s\\n' '${JSON.stringify(envelope)}'\n`);
    chmodSync(fake, 0o755);
    const result = spawnSync(process.execPath, [new URL("../run-scan.mjs", import.meta.url).pathname, "--macro-only", "--dry-run", "--model", "sonnet", "--max-turns", "10"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCAN_OUT_DIR: dir } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(marker, "utf8"), /--max-turns\n10/);
    const payload = JSON.parse(readFileSync(join(dir, readdirSync(dir).find((file) => file.startsWith("payload-"))), "utf8"));
    assert.deepEqual(payload.tickers, []);
    assert.equal(payload.macro.notes, "No data");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("macro call uses a dollar cap when Claude lacks --max-turns", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "macro-budget-"));
  try {
    const marker = join(dir, "args");
    const envelope = { result: JSON.stringify({ sectorRotationIntoGrowth: null, dataTailwind: null, notes: "No data", evidence: [], events: [] }), num_turns: 1 };
    const fake = join(dir, "claude");
    writeFileSync(fake, `#!/bin/sh\nif [ "$1" = '--help' ]; then printf '%s\\n' 'Claude help'; exit 0; fi\nprintf '%s\\n' "$@" > '${marker}'\nprintf '%s\\n' '${JSON.stringify(envelope)}'\n`);
    chmodSync(fake, 0o755);
    const result = spawnSync(process.execPath, [new URL("../run-scan.mjs", import.meta.url).pathname, "--macro-only", "--dry-run", "--max-turns", "10"], { encoding: "utf8", env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCAN_OUT_DIR: dir } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(marker, "utf8"), /--max-budget-usd\n0\.5/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

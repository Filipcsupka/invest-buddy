import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gateTradingDay } from "../gate-db.mjs";

test("a pending scheduled gate keeps its original market date on a later retry", () => {
  assert.equal(gateTradingDay("2026-10-06"), "2026-10-05");
  assert.equal(gateTradingDay("2026-10-10"), "2026-10-09");
});

test("an empty database gate exits extract and judge with zero model calls", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.method === "GET" ? { asOf: new Date().toISOString().slice(0, 10), symbols: [], reasons: {}, accessions: {}, revision: 1 } : { recorded: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const run = (script) => new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL(`../${script}`, import.meta.url).pathname, "--gate-from-db", "--base-url", base], {
      env: { ...process.env, INGEST_TOKEN: "test-token", SCAN_OUT_DIR: mkdtempSync(join(tmpdir(), "f3-gate-")) },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stderr }));
  });
  try {
    for (const script of ["run-extract.mjs", "run-judge.mjs"]) {
      const result = await run(script);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr, /nothing changed; 0 model calls/);
    }
    assert.equal(requests.filter((request) => request.startsWith("POST ")).length, 2);
    assert.ok(requests.every((request) => request.includes("/api/ingest/gate")));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

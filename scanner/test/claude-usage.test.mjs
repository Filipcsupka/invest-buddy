import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchLiveUsage, createUsageMonitor, parseLiveUsage, earlyStopLine } from "../claude-usage.mjs";

const payload = (five, week) => ({ five_hour: { utilization: five, resets_at: "2026-10-07T10:00:00Z" }, seven_day: { utilization: week, resets_at: "2026-10-11T00:00:00Z" } });

test("reads OAuth usage without exposing the token and records start and end samples", async () => {
  const sent = [], logs = [];
  const fetcher = async (url, init) => {
    if (url.startsWith("https://api.anthropic.com/")) {
      assert.equal(init.headers.Authorization, "Bearer synthetic-token");
      assert.equal(init.headers["anthropic-beta"], "oauth-2025-04-20");
      return Response.json(payload(sent.length ? 24 : 20, 40));
    }
    sent.push(JSON.parse(init.body)); return Response.json({ recorded: true });
  };
  const monitor = createUsageMonitor({ baseUrl: "http://web", ingestToken: "synthetic-ingest", oauthToken: "synthetic-token", job: "extract", runId: "00000000-0000-4000-8000-000000000020", log: (line) => logs.push(line), fetcher });
  assert.equal(await monitor.start(), null);
  assert.equal(await monitor.end(), null);
  assert.deepEqual(sent.map((s) => s.phase), ["start", "end"]);
  assert.deepEqual(sent.map((s) => s.fiveHourPct), [20, 24]);
  assert.ok(logs.every((line) => !line.includes("synthetic-token")));
});

test("403, malformed response, and timeout leave the job running", async () => {
  assert.deepEqual(await fetchLiveUsage("token", { fetcher: async () => new Response("", { status: 403 }) }), { unavailable: "403" });
  assert.deepEqual(await fetchLiveUsage("token", { fetcher: async () => Response.json({ five_hour: {} }) }), { unavailable: "request failed" });
  assert.deepEqual(await fetchLiveUsage("token", { fetcher: async () => { throw new DOMException("timed out", "TimeoutError"); } }), { unavailable: "request failed" });
  assert.throws(() => parseLiveUsage({ five_hour: { utilization: "20" }, seven_day: { utilization: 30 } }), /malformed/);
  const logs = [];
  const monitor = createUsageMonitor({ baseUrl: "http://web", ingestToken: null, oauthToken: "token", job: "judge", runId: "00000000-0000-4000-8000-000000000020", log: (line) => logs.push(line), fetcher: async () => new Response("", { status: 403 }) });
  assert.equal(await monitor.start(), null);
  assert.equal(await monitor.end(), null);
  assert.deepEqual(logs, ["USAGE unavailable (403)"]);
});

test("soft stop uses the configured subscription threshold", async () => {
  const monitor = createUsageMonitor({ baseUrl: "http://web", ingestToken: null, oauthToken: "token", job: "extract", runId: "00000000-0000-4000-8000-000000000020", log: () => {}, fetcher: async () => Response.json(payload(86, 20)) });
  const stopped = await monitor.start();
  assert.equal(stopped.window, "5h");
  assert.equal(earlyStopLine(stopped), "STOPPING EARLY: five_hour at 86%");
});

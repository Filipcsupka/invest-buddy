import { describe, expect, it } from "vitest";
import { stubHttp, fx } from "./sources/testing";
import { MemoryCollectorRepository } from "../db/collectors";
import { storeDailyEcbFx, createMacroEcbBackfillJob } from "../jobs/macro-observations";
import { MemoryBackfillStore, runBackfill } from "../jobs/backfill";
import { MemoryUsageLedger } from "../data/usage";
import { getSource } from "../data/sources-registry";
import { ECB_HIST_90D_URL, ECB_HIST_URL, ECB_SERIES_IDS, parseEcbFx } from "./ecb-fx";

const XML = fx("ecb_eurofxref_hist.xml");

describe("ECB reference rates", () => {
  it("parses the supported currencies and ignores other currencies", () => {
    const rows = parseEcbFx(XML);
    expect(new Set(rows.map((r) => r.seriesId))).toEqual(new Set(ECB_SERIES_IDS));
    expect(rows).toHaveLength(16);
    expect(rows.find((r) => r.seriesId === "ECB_EURUSD" && r.obsDate === "2026-10-09")).toMatchObject({ value: 1.165, sourceId: "ecb", realtimeStart: "2026-10-09" });
  });
  it("rejects a document with no dated rates", () => {
    expect(() => parseEcbFx("<html>moved</html>")).toThrow(/no dated Cube/);
  });
  it("second run adds none and weekend dates stay empty", async () => {
    const repo = new MemoryCollectorRepository();
    const http = stubHttp(() => XML);
    expect((await storeDailyEcbFx(repo, http)).written).toBe(16);
    expect((await storeDailyEcbFx(repo, http)).written).toBe(0);
    expect(http.calls.map((c) => c.url)).toEqual([ECB_HIST_90D_URL, ECB_HIST_90D_URL]);
    expect(repo.macroObservations.some((r) => ["2026-10-10", "2026-10-11"].includes(r.obsDate))).toBe(false);
  });
  it("a run after missed days fills the gap from the 90 day file", async () => {
    const repo = new MemoryCollectorRepository();
    const rows = parseEcbFx(XML);
    const lastDay = rows.map((r) => r.obsDate).sort().at(-1)!;
    expect(await repo.upsertMacroObservations(rows.filter((r) => r.obsDate === lastDay))).toBe(8);
    expect((await storeDailyEcbFx(repo, stubHttp(() => XML))).written).toBe(8);
    expect(repo.macroObservations).toHaveLength(16);
  });
  it("reports a failing fetch without throwing", async () => {
    const result = await storeDailyEcbFx(new MemoryCollectorRepository(), stubHttp(() => { throw new Error("down"); }));
    expect(result.failures).toEqual(["ecb fx: down"]);
  });
  it("backfills the history file in one request", async () => {
    const repo = new MemoryCollectorRepository();
    const http = stubHttp(() => XML);
    const result = await runBackfill(createMacroEcbBackfillJob(repo, http), new MemoryBackfillStore(), new MemoryUsageLedger({ ecb: { dailyCap: null, monthlyCostCapEur: 0 } }), {});
    expect(result.status).toBe("completed");
    expect(http.calls.map((c) => c.url)).toEqual([ECB_HIST_URL]);
    expect(repo.macroObservations).toHaveLength(16);
  });
  it("registers the ecb source with attribution text", () => {
    const ecb = getSource("ecb");
    expect(ecb?.attributionText).toBe("Source: ECB");
  });
});

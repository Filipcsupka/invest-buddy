import { describe, expect, it } from "vitest";
import { eventNote, loadMacroEvents, MACRO_EVENTS, mergeMacroEvents, upcomingMacroEvents, type MacroEvent } from "./macro-calendar";

describe("macro calendar", () => {
  it("finds nothing on a quiet day", () => {
    expect(upcomingMacroEvents("2026-10-15")).toEqual([]);
    expect(eventNote([])).toBeNull();
  });
  it("counts sessions to the FOMC decision", () => {
    expect(upcomingMacroEvents("2026-10-23").map((e) => [e.kind, e.sessions])).toEqual([["FOMC", 3]]);
    expect(upcomingMacroEvents("2026-10-28")[0].sessions).toBe(0);
  });
  it("skips past events and counts from a weekend", () => {
    expect(upcomingMacroEvents("2026-10-29")).toEqual([]);
    expect(upcomingMacroEvents("2026-11-07").map((e) => e.kind)).toEqual(["CPI"]);
  });
  it("builds a flag note", () => {
    expect(eventNote(upcomingMacroEvents("2026-11-09"))).toContain("CPI (October) 2026-11-10 (in 1 session)");
  });
});

describe("stored macro calendar", () => {
  const stored: MacroEvent[] = [
    { date: "2026-11-12", kind: "CPI", label: "CPI (October)" },
    { date: "2027-01-13", kind: "CPI", label: "CPI (December)" },
    { date: "2027-01-27", kind: "FOMC", label: "FOMC decision" },
  ];
  it("lets stored rows replace fallback dates of the same kind and keeps other kinds", () => {
    const merged = mergeMacroEvents(stored);
    expect(merged.filter((e) => e.kind === "CPI").map((e) => e.date)).toEqual(["2026-11-12", "2027-01-13"]);
    expect(merged.filter((e) => e.kind === "FOMC").map((e) => e.date)).toEqual(["2027-01-27"]);
    expect(merged.filter((e) => e.kind === "PPI")).toEqual(MACRO_EVENTS.filter((e) => e.kind === "PPI"));
    expect(merged.map((e) => e.date)).toEqual([...merged.map((e) => e.date)].sort());
  });
  it("keeps fallback rows dated after the newest stored row of their kind", () => {
    const merged = mergeMacroEvents([{ date: "2026-11-06", kind: "NFP", label: "Jobs report (October)" }]);
    expect(merged.filter((e) => e.kind === "NFP").map((e) => e.date)).toEqual(["2026-11-06", "2026-12-04"]);
  });
  it("uses the stored calendar for the event window", () => {
    expect(upcomingMacroEvents("2026-11-10", 3, [], mergeMacroEvents(stored)).map((e) => [e.kind, e.date])).toEqual([["CPI", "2026-11-12"], ["PPI", "2026-11-13"]]);
    expect(upcomingMacroEvents("2027-01-11", 3, [], mergeMacroEvents(stored)).map((e) => e.label)).toEqual(["CPI (December)"]);
  });
  it("reads the table and falls back on no pool, a failed read or unusable rows", async () => {
    const seen: unknown[][] = [];
    const db = { query: async (_sql: string, params: unknown[]) => { seen.push(params); return { rows: [...stored.map((e) => ({ kind: e.kind, event_date: e.date, label: e.label })), { kind: "GDP", event_date: "2026-11-20", label: "GDP" }, { field: "epsBeat" }] }; } };
    const loaded = await loadMacroEvents(db as never, "2026-10-19");
    expect(seen).toEqual([["2026-10-19"]]);
    expect(loaded).toEqual(mergeMacroEvents(stored));
    expect(await loadMacroEvents(null, "2026-10-19")).toEqual([...MACRO_EVENTS]);
    expect(await loadMacroEvents({ query: async () => { throw new Error('relation "macro_events" does not exist'); } } as never, "2026-10-19")).toEqual([...MACRO_EVENTS]);
  });
});

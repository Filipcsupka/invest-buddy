import { describe, expect, it } from "vitest";
import { messages } from "../i18n/messages";
import { ruleGroups, stateOrder, type StateKey } from "../i18n/rules";
import { fixtureBars, fixtureFundamentals, fixtureMacro } from "../data/fixtures";
import { score } from "./score";
import { POINTS_MAX, statusView, type StatusRuleHit } from "./status";

const ids = ruleGroups.flatMap((g) => g.rules.map((r) => r.id));
const known = (matched: string[] = []): StatusRuleHit[] => ids.map((id) => ({ id, matched: matched.includes(id), unknown: false }));
const get = (locale: "en" | "sk", key: string) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages[locale]) as string;

const expected: Record<StateKey, { band: string; position: number | null; points: number }> = {
  broken: { band: "red", position: 0, points: 20 },
  ignore: { band: "orange", position: 1, points: 8 },
  wait: { band: "yellow", position: 2, points: 13 },
  watch: { band: "blue", position: 3, points: 16 },
  setup: { band: "green", position: 4, points: 22 },
  insufficient: { band: "gray", position: null, points: 0 },
};

describe("statusView", () => {
  it("covers every state key", () => expect(Object.keys(expected).sort()).toEqual([...stateOrder].sort()));

  for (const state of stateOrder) {
    it(`maps ${state}`, () => {
      const e = expected[state];
      const view = statusView({ state, points: e.points, ruleHits: known(), adviceOutput: false });
      expect(view.band).toBe(e.band);
      expect(view.position).toBe(e.position);
      expect(view.colorToken).toBe(`status-${e.band}`);
      expect(view.state).toBe(state);
      expect(view.labelKey).toBe(`status.labels.${state}`);
      expect(view.headlineKey).toBe(`status.headline.${state}`);
      expect(view.points).toBe(state === "insufficient" ? null : e.points);
    });
  }

  it("orders positions red to green", () => {
    const positions = (["broken", "ignore", "wait", "watch", "setup"] as const).map((state) => statusView({ state, points: 10, ruleHits: [], adviceOutput: false }).position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses the neutral green label with the flag off and the action label only with it on", () => {
    const off = statusView({ state: "setup", points: 20, ruleHits: known(), adviceOutput: false });
    const on = statusView({ state: "setup", points: 20, ruleHits: known(), adviceOutput: true });
    expect(get("en", off.labelKey)).toBe("Conditions met");
    expect(get("sk", off.labelKey)).toBe("Podmienky splnené");
    expect(get("en", on.labelKey)).toBe("Buy zone");
    expect(get("sk", on.labelKey)).toBe("Zóna nákupu");
    expect(on.headlineKey).toBe("status.headlineAdvice.setup");
    expect(get("en", off.headlineKey)).not.toMatch(/buy/i);
  });

  it("flag on changes nothing outside the green state", () => {
    for (const state of stateOrder.filter((s) => s !== "setup")) {
      const a = statusView({ state, points: 10, ruleHits: known(), adviceOutput: false });
      expect(statusView({ state, points: 10, ruleHits: known(), adviceOutput: true })).toEqual(a);
    }
  });

  it("resolves every label and headline key in both locales", () => {
    for (const adviceOutput of [false, true]) for (const state of stateOrder) {
      const view = statusView({ state, points: 10, ruleHits: known(), adviceOutput });
      for (const locale of ["en", "sk"] as const) {
        expect(get(locale, view.labelKey)).toBeTruthy();
        expect(get(locale, view.headlineKey)).toBeTruthy();
        for (const c of view.confirmations) expect(get(locale, c.labelKey)).toBeTruthy();
      }
    }
  });

  it("matches the wording table for flag-off labels", () => {
    const en = stateOrder.map((state) => get("en", statusView({ state, points: 1, ruleHits: [], adviceOutput: false }).labelKey));
    const sk = stateOrder.map((state) => get("sk", statusView({ state, points: 1, ruleHits: [], adviceOutput: false }).labelKey));
    expect(en).toEqual(["Conditions met", "Watching", "Waiting", "Not now", "Criteria broken", "Not enough data"]);
    expect(sk).toEqual(["Podmienky splnené", "Sledovanie", "Čakanie", "Mimo výberu", "Kritériá porušené", "Nedostatok údajov"]);
  });

  describe("coverage", () => {
    it("counts all 25 points when every rule has data", () => {
      const view = statusView({ state: "wait", points: 13, ruleHits: known(), adviceOutput: false });
      expect(view.coverage).toEqual({ pointsKnown: 25, pointsMax: 25, unknownRules: [] });
      expect(POINTS_MAX).toBe(25);
    });

    it("never counts an unknown rule as known points", () => {
      const hits = known(["above-ma"]).map((h) => (h.id === "catalyst" || h.id === "macro-data" ? { ...h, matched: false, unknown: true } : h));
      const view = statusView({ state: "ignore", points: 3, ruleHits: hits, adviceOutput: false });
      expect(view.coverage.pointsKnown).toBe(20);
      expect(view.coverage.unknownRules).toEqual(["catalyst", "macro-data"]);
    });

    it("treats a rule missing from the stored hits as no data", () => {
      const view = statusView({ state: "watch", points: 16, ruleHits: [{ id: "above-ma", matched: true }, { id: "uptrend", matched: true }], adviceOutput: false });
      expect(view.coverage.pointsKnown).toBe(6);
      expect(view.coverage.unknownRules).toHaveLength(8);
    });

    it("handles no hits at all: nothing known, all ten rules unknown", () => {
      for (const ruleHits of [null, undefined, []]) {
        const view = statusView({ state: "insufficient", points: null, ruleHits, adviceOutput: false });
        expect(view.coverage.pointsKnown).toBe(0);
        expect(view.coverage.unknownRules).toEqual(ids);
      }
    });

    it("keeps a known unmatched rule as known (0 points earned, still data)", () => {
      const view = statusView({ state: "ignore", points: 0, ruleHits: known(), adviceOutput: false });
      expect(view.coverage.pointsKnown).toBe(25);
    });
  });

  describe("missing data", () => {
    it("shows no points for insufficient, never 0", () => {
      const view = statusView({ state: "insufficient", points: 0, ruleHits: [], adviceOutput: false });
      expect(view.points).toBeNull();
      expect(view.headlineParams.points).toBeNull();
      expect(view.position).toBeNull();
    });

    it("falls back to insufficient for an unknown state or bad points", () => {
      expect(statusView({ state: "nonsense", points: 20, ruleHits: [], adviceOutput: true }).state).toBe("insufficient");
      expect(statusView({ state: "setup", points: Number.NaN, ruleHits: [], adviceOutput: false }).points).toBeNull();
      expect(statusView({ state: "setup", points: null, ruleHits: [], adviceOutput: false }).points).toBeNull();
    });

    it("clamps points to 0..25", () => {
      expect(statusView({ state: "setup", points: 99, ruleHits: [], adviceOutput: false }).points).toBe(25);
      expect(statusView({ state: "ignore", points: -3, ruleHits: [], adviceOutput: false }).points).toBe(0);
    });
  });

  describe("confirmations", () => {
    const states = (view: ReturnType<typeof statusView>) => Object.fromEntries(view.confirmations.map((c) => [c.id, c.state]));

    it("lists the five chips in order with no data by default", () => {
      const view = statusView({ state: "wait", points: 12, ruleHits: [], adviceOutput: false });
      expect(view.confirmations.map((c) => c.id)).toEqual(["insider", "epsBeat", "guidanceRaised", "catalyst", "volume"]);
      expect(new Set(Object.values(states(view)))).toEqual(new Set(["no-data"]));
    });

    it("separates met, not met and no data", () => {
      const view = statusView({ state: "setup", points: 20, ruleHits: [], signals: { insiderNetBuy: true, epsBeat: false, guidanceRaised: null }, adviceOutput: false });
      expect(states(view)).toMatchObject({ insider: "met", epsBeat: "not-met", guidanceRaised: "no-data" });
    });

    it("reads catalyst and volume from rule hits when no signal is given", () => {
      const hits: StatusRuleHit[] = [{ id: "catalyst", matched: true }, { id: "green-volume", matched: false }];
      expect(states(statusView({ state: "wait", points: 12, ruleHits: hits, adviceOutput: false }))).toMatchObject({ catalyst: "met", volume: "not-met" });
      const unknown: StatusRuleHit[] = [{ id: "catalyst", matched: false, unknown: true }];
      expect(states(statusView({ state: "wait", points: 12, ruleHits: unknown, adviceOutput: false })).catalyst).toBe("no-data");
    });

    it("an explicit null signal beats a matching rule hit", () => {
      const view = statusView({ state: "wait", points: 12, ruleHits: [{ id: "catalyst", matched: true }], signals: { productCatalyst: null }, adviceOutput: false });
      expect(states(view).catalyst).toBe("no-data");
    });

    it("does not change the band", () => {
      const plain = statusView({ state: "watch", points: 16, ruleHits: known(), adviceOutput: false });
      const all = statusView({ state: "watch", points: 16, ruleHits: known(), signals: { insiderNetBuy: true, epsBeat: true, guidanceRaised: true, productCatalyst: true, volumeConfirmation: true }, adviceOutput: false });
      expect({ ...all, confirmations: [] }).toEqual({ ...plain, confirmations: [] });
    });
  });

  it("works on a real score result", () => {
    const result = score({ ticker: "NVDA", bars: fixtureBars("NVDA"), fundamentals: fixtureFundamentals("NVDA"), macro: fixtureMacro("NVDA") });
    const key = { "Setup met (>=18)": "setup", Watch: "watch", Wait: "wait", Ignore: "ignore", "Criteria broken": "broken", "Insufficient/invalid data": "insufficient" }[result.state] as StateKey;
    const view = statusView({ state: key, points: result.total, ruleHits: result.ruleHits, adviceOutput: false });
    expect(view.state).toBe(key);
    const weight = (id: string) => ruleGroups.flatMap((g) => g.rules).find((r) => r.id === id)?.points ?? 0;
    expect(view.coverage.pointsKnown + view.coverage.unknownRules.reduce((sum, id) => sum + weight(id), 0)).toBe(25);
  });
});

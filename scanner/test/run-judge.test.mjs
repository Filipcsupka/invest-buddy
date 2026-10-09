import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, validateJudgeOutput, normalizeOutput, changedSignals, mergeIdeas, buildModelInput, inventedFigures, figureContext, judgeHash, agentModeArgs, parseAgentEnvelope, amountText } from "../run-judge.mjs";
import { figureValuesIn, sameFigureValues, sameProtectedTokens } from "../figure-tokens.mjs";
import { callAgentNoTools } from "../run-extract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "..", "run-judge.mjs");
const U1 = "https://www.sec.gov/Archives/edgar/data/1045810/nvda-8k-ex99.htm", U2 = "https://www.sec.gov/Archives/edgar/data/1045810/nvda-10q.htm", U3 = "https://www.sec.gov/Archives/edgar/data/2488/amd-8k.htm";

const sig = (symbol, over = {}) => ({ symbol, action: "ADD", sizeTier: "ADD_THIRD", amountMinEur: 60, amountMaxEur: 90, ratings: { company: "Very strong", entry: "Strong", catalyst: "Good" }, points: { company: 6, entry: 4, catalyst: 2 }, unconfirmed: false, carriedFrom: null, confirmedFields: ["epsBeat", "revenueAccelerating"], reasons: ["Fundamentals hold and the entry is good."], ownerNotes: [], ruleConfigVersion: "2026-10-06.1", signature: `${over.action ?? "ADD"}|Very strong|Strong|Good|${over.sizeTier ?? "ADD_THIRD"}`, ...over });
const ctx = (symbol, evidence, held = null) => ({ symbol, name: symbol, sector: "AI", tier: 1, held, score: { total: 19, technical: 9, fundamentals: 7, macro: 3, state: "Setup met (>=18)", pullbackInUptrend: true, asOf: "2026-10-05" }, invalidReasons: [], technicals: { close: 120.5, belowHigh20Percent: 7.4, rsi14: 48.2, regime: "pullback" }, matchedRules: [], fields: {}, expiredFields: [], carriedFrom: null, evidence: evidence.map((url) => ({ url, field: "epsBeat", publishedAt: "2026-10-01", quote: "q" })) });
// Synthetic baseline, test only.
const input = (over = {}) => ({
  asOf: "2026-10-05", generatedAt: "2026-10-05T20:00:00.000Z", ruleConfigVersion: "2026-10-06.1",
  benchmark: { symbol: "CSPX", description: "S&P 500 UCITS ETF" },
  portfolio: { asOf: "2026-10-05", source: "manual", currency: "EUR", cashEur: 600, monthlyContributionEur: 200, investedEur: 3030, positions: [{ symbol: "NVDA", valueEur: 540 }, { symbol: "CSPX", valueEur: 2100 }] },
  symbols: [ctx("NVDA", [U1, U2], { valueEur: 540, weightPercent: 17.8 }), ctx("AMD", [U3])],
  signals: [sig("AMD", { action: "WATCH", sizeTier: "NONE", amountMinEur: 0, amountMaxEur: 0, unconfirmed: true, carriedFrom: "2026-09-23" }), sig("NVDA")],
  previousIdeas: [], ...over,
});
const words = (symbol, over = {}) => {
  const result = ({
  symbol, verdict: "Fundamentals hold on a dip.", whatHappened: ["Price closed 7.4 percent under its 20-day high.", "EPS beat stated in the release."], whyItMatters: ["Dip qualifier met with a score of 19."],
  numbers: [{ label: "Score", value: "19 of 25" }, { label: "Below high", value: "7.4%" }, { label: "RSI", value: "48.2" }],
  plan: { trigger: "A fresh catalyst would raise the catalyst rating.", invalidation: "A guidance cut.", opportunityCost: "Versus CSPX and cash." },
  evidence: [{ url: U1, label: "Release" }, { url: U2, label: "10-Q" }], unconfirmed: false, sk: { verdict: "Fundamenty držia pri poklese.", whatHappened: ["Cena je 7.4 percent pod 20-dňovým maximom.", "Zisk prekonal očakávania."], whyItMatters: ["Pokles spĺňa podmienku pri skóre 19."], numbers: [{ label: "Skóre", value: "19 z 25" }, { label: "Pod maximom", value: "7.4%" }, { label: "RSI", value: "48.2" }], plan: { trigger: "Nový katalyzátor by zvýšil hodnotenie.", invalidation: "Zníženie výhľadu.", opportunityCost: "Oproti CSPX a hotovosti." }, evidence: [{ url: U1, label: "Správa" }, { url: U2, label: "10-Q" }] }, ...over,
  });
  if (!("sk" in over)) {
    result.sk = { ...result.sk, evidence: result.evidence.map((e) => ({ url: e.url, label: e.label })),
      ...(over.numbers ? { numbers: result.numbers } : {}),
      ...(over.verdict ? { verdict: result.verdict } : {}),
      ...(over.whatHappened ? { whatHappened: result.whatHappened } : {}),
      ...(over.whyItMatters ? { whyItMatters: result.whyItMatters } : {}),
      ...(over.plan ? { plan: result.plan } : {}),
      ...(result.downgrade ? { downgradeReason: result.downgrade.reason } : {}),
      ...(result.conflict ? { conflictReason: result.conflict.reason } : {}) };
  }
  return result;
};
const merge = (ideas, i = input(), n = i.signals) => mergeIdeas({ ideas }, n, buildModelInput(i, n));

test("defaults and flags", () => {
  const o = parseArgs([], {});
  assert.deepEqual([o.model, o.maxSymbols, o.agentMode, o.maxTurns, o.dryRun, o.force], ["sonnet", 12, false, 8, false, false]);
  assert.equal(parseArgs([], { JUDGE_MODEL: "opus" }).model, "opus");
  const p = parseArgs(["--dry-run", "--force", "--model", "haiku", "--as-of", "2026-10-02", "--max-symbols", "5", "--agent-mode", "--max-turns", "4"], {});
  assert.deepEqual([p.dryRun, p.force, p.model, p.asOf, p.maxSymbols, p.agentMode, p.maxTurns], [true, true, "haiku", "2026-10-02", 5, true, 4]);
});

test("schema accepts wording, and the model cannot send action, amounts or ratings", () => {
  assert.deepEqual(validateJudgeOutput({ ideas: [words("NVDA")] }), []);
  assert.deepEqual(validateJudgeOutput({ ideas: [] }), []);
  assert.deepEqual(validateJudgeOutput({ ideas: [words("NVDA", { downgrade: { reason: "r", evidenceUrl: U1 }, conflict: { reason: "r", evidenceUrl: U2 } })] }), []);
  const bad = (over) => validateJudgeOutput({ ideas: [words("NVDA", over)] });
  for (const k of ["action", "sizeTier", "amountMinEur", "setup"]) assert.match(bad({ [k]: "ADD" }).join(), /unknown field/, k);
  assert.match(bad({ whatHappened: ["only one"] }).join(), /fewer than 2/);
  assert.match(bad({ numbers: [{ label: "a", value: "b" }] }).join(), /fewer than 3/);
  assert.match(bad({ evidence: [{ url: "http://insecure.example/x", label: "x" }] }).join(), /does not match/);
  assert.match(bad({ downgrade: { reason: "r" } }).join(), /evidenceUrl: required/);
  assert.match(bad({ plan: { trigger: "t", invalidation: "i" } }).join(), /opportunityCost: required/);
  assert.match(bad({ sk: undefined }).join(), /sk: expected object/);
  assert.match(bad({ sk: { verdict: "x" } }).join(), /whatHappened: required/);
  assert.match(validateJudgeOutput({}).join(), /ideas: required/);
});

test("null downgrade and conflict count as absent, other deviations stay errors", () => {
  const out = normalizeOutput({ ideas: [words("NVDA", { downgrade: null, conflict: null })] });
  assert.deepEqual(validateJudgeOutput(out), []);
  assert.ok(!("downgrade" in out.ideas[0]));
  assert.match(validateJudgeOutput(normalizeOutput({ ideas: [words("NVDA", { whyItMatters: ["a", "b", "c"] })] })).join(), /more than 2/);
});

test("only changed signals are news; no routine HOLD", () => {
  const nv = sig("NVDA");
  const prev = [{ symbol: "NVDA", signature: nv.signature }, { symbol: "AMD", signature: "WATCH|A|B|C|NONE" }];
  assert.deepEqual(changedSignals([nv], prev), []);
  assert.deepEqual(changedSignals([sig("NVDA", { amountMaxEur: 95 })], prev), [], "a changed owner band alone is not news");
  assert.equal(changedSignals([sig("NVDA", { action: "HIGH_CONVICTION_ADD", sizeTier: "ADD_HALF" })], prev).length, 1, "a changed tier is news");
  assert.equal(changedSignals([sig("NVDA", { action: "HOLD", sizeTier: "NONE" })], prev).length, 1, "ADD to HOLD is a change");
  assert.equal(changedSignals([sig("MSFT", { action: "HOLD", sizeTier: "NONE" })], prev).length, 0, "a first HOLD is noise");
  assert.equal(changedSignals([sig("MSFT")], prev).length, 1, "a first ADD is news");
});

test("the merge keeps the fixed decision, the tier and the private amount text", () => {
  const { ideas } = merge([words("NVDA"), words("AMD", { evidence: [], unconfirmed: false })]);
  const nvda = ideas.find((i) => i.symbol === "NVDA"), amd = ideas.find((i) => i.symbol === "AMD");
  assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow], ["ADD", "ADD_THIRD", 60, 90, "EUR 60-90"]);
  assert.deepEqual(nvda.setup, { company: "Very strong", entry: "Strong", catalyst: "Good" });
  assert.equal(nvda.signature, "ADD|Very strong|Strong|Good|ADD_THIRD");
  assert.equal(nvda.ruleConfigVersion, "2026-10-06.1");
  assert.equal(amd.sizeTier, "NONE");
  assert.equal(amd.plan.amountNow, "EUR 0");
  assert.equal(amd.carriedFrom, "2026-09-23");
  assert.equal(amd.unconfirmed, true, "the rules mark it unconfirmed and the model cannot clear that");
  assert.equal(amountText("ADD", 60.5, 90), "EUR 60.50-90");
});

test("the model input is data only: no portfolio, no EUR band, no held value, the tier in words", () => {
  const m = buildModelInput(input(), input().signals);
  assert.ok(!("portfolio" in m));
  const text = JSON.stringify(m);
  assert.doesNotMatch(text, /amountMinEur|amountMaxEur|cashEur|valueEur|weightPercent|ownerNotes/);
  const nvda = m.items.find((i) => i.signal.symbol === "NVDA");
  assert.deepEqual([nvda.signal.sizeTier, nvda.signal.size], ["ADD_THIRD", "add about 1/3 of a full position"]);
  assert.ok(!("held" in nvda.context));
  assert.doesNotThrow(() => merge([words("NVDA", { verdict: "Add about 1/3 of a full position on the dip." }), words("AMD", { evidence: [] })]), "the tier fraction is an input figure");
  assert.throws(() => merge([words("NVDA", { verdict: "NVDA is 17.8 percent of the portfolio." }), words("AMD", { evidence: [] })]), /figures not in the input: 17.8/, "the owner's weight is not in the model input");
});

test("evidence urls outside the input, invented figures and wrong symbols fail the call", () => {
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: "https://example.com/made-up", label: "x" }, { url: U1, label: "ok" }] }), words("AMD", { evidence: [] })]), /evidence url not in the input/);
  assert.throws(() => merge([words("NVDA", { verdict: "Cash left would be EUR 510." }), words("AMD", { evidence: [] })]), /figures not in the input: 510/);
  assert.throws(() => merge([words("NVDA", { whyItMatters: ["Revenue grew 37.5 percent."] }), words("AMD", { evidence: [] })]), /figures not in the input/);
  assert.throws(() => merge([words("NVDA"), words("AMD", { evidence: [] }), words("ZZZ")]), /not an item/);
  assert.throws(() => merge([words("NVDA")]), /no idea for AMD/);
  assert.throws(() => merge([words("NVDA"), words("NVDA"), words("AMD", { evidence: [] })]), /second idea/);
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: U1, label: "one" }] }), words("AMD", { evidence: [] })]), /fewer than two evidence links/);
});

test("Slovak wording rejects invented figures and changed number values", () => {
  assert.throws(() => merge([words("NVDA", { sk: { ...words("NVDA").sk, verdict: "Výnos 999 percent." } }), words("AMD", { evidence: [] })]), /Slovak prose figures differ|figures not in the input/);
  assert.throws(() => merge([words("NVDA", { sk: { ...words("NVDA").sk, numbers: [{ label: "Skóre", value: "999 z 25" }, ...words("NVDA").sk.numbers.slice(1)] } }), words("AMD", { evidence: [] })]), /figures not in the input/);
  assert.throws(() => merge([words("NVDA", { sk: { ...words("NVDA").sk, evidence: [{ url: U2, label: "x" }, { url: U1, label: "y" }] } }), words("AMD", { evidence: [] })]), /Slovak evidence URLs differ/);
});

test("index names are labels, and a skipped figure shows its context", () => {
  const inp = { score: 19 };
  assert.deepEqual(inventedFigures(["Outperforming the S&P 500 and the Nasdaq 100 and Russell 2000."], inp), []);
  assert.deepEqual(inventedFigures(["Margin of 33 percent."], inp), [33]);
  assert.match(figureContext(["Margin of 33 percent on revenue."], 33), /Margin of 33 percent/);
});

test("a buy with fewer than two cited links is topped up from the labelled input links", () => {
  const i = input();
  const ev = (url, label) => ({ url, field: "epsBeat", publishedAt: "2026-10-01", quote: null, label });
  i.symbols[0].evidence = [ev(U1, "Earnings release"), ev(U2, "10-Q")];
  const { ideas, notes } = merge([words("NVDA", { evidence: [{ url: U1, label: "one" }] }), words("AMD", { evidence: [] })], i);
  const nvda = ideas.find((x) => x.symbol === "NVDA");
  assert.deepEqual(nvda.evidence.map((e) => e.url), [U1, U2]);
  assert.ok(notes.some((n) => /NVDA: evidence link added/.test(n)));
  // a link without a label is never added
  i.symbols[0].evidence = [ev(U1, "Earnings release"), ev(U2, null)];
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: U1, label: "one" }] }), words("AMD", { evidence: [] })], i), /fewer than two evidence links/);
});

test("figures: input numbers and common rule windows pass, others are rejected", () => {
  const inp = { score: 19, below: 7.4, text: "price 1,200.50" };
  assert.deepEqual(inventedFigures(["score 19, 7.40 percent under the 20-day high, RSI 14, 1200.5"], inp), []);
  assert.deepEqual(inventedFigures(["target 150 and 33.1"], inp), [150, 33.1]);
});

test("figures: digits in urls, dates, ids and accession numbers are not allowed figures", () => {
  const inp = { evidence: [{ url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/nvda-8k.htm", publishedAt: "2026-10-01", accession: "0001045810-26-000123", id: 777 .toString() }], close: 120.5 };
  assert.deepEqual(inventedFigures(["close 120.5"], inp), []);
  assert.deepEqual(inventedFigures(["filing 1045810 and 123 and 777"], inp), [1045810, 123, 777]);
  assert.deepEqual(inventedFigures(["see 2026-10-01"], inp), []);
  assert.deepEqual(inventedFigures(["see 2026-10-02"], inp), [2026, 10, 2]);
});

test("figures: input magnitudes match either sign, ranges and windows are not signs", () => {
  const inp = { change: -5.2, up: 3.1, range: "EUR 60-90" };
  assert.deepEqual(inventedFigures(["fell -5.2 percent", "rose 3.1"], inp), []);
  assert.deepEqual(inventedFigures(["fell 5.2 percent"], inp), []);
  assert.deepEqual(inventedFigures(["fell -3.1 percent"], inp), []);
  assert.deepEqual(inventedFigures(["fell 5.3 percent"], inp), [5.3]);
  assert.deepEqual(inventedFigures(["EUR 60-90 and the 20-day high"], inp), []);
});

test("incident: decimal comma and grouped thousands keep bilingual figures equal", () => {
  assert.deepEqual(figureValuesIn("RSI 70,7 and revenue 1\u202f200,50"), [70.7, 1200.5]);
  assert.ok(sameFigureValues("RSI 70.7 and revenue 1,200.50", "RSI 70,7 and revenue 1\u00a0200,50"));
  assert.ok(sameFigureValues("Revenue 1,200.50 and 50,000.12", "Tržby 1.200,50 a 50 000,12"));
  assert.deepEqual(inventedFigures(["Revenue 1.200,50 and 50 000,12"], {}), [1200.5, 50000.12]);
  assert.deepEqual(inventedFigures(["Revenue 1.234.567 and 1 234 567"], {}), [1234567]);
  assert.equal(sameFigureValues("RSI 70.7", "RSI 70,8"), false);
  const original = words("NVDA");
  const sk = { ...original.sk, whatHappened: ["Cena je 7,4 percent pod 20-dňovým maximom.", original.sk.whatHappened[1]], numbers: [original.sk.numbers[0], { ...original.sk.numbers[1], value: "7,4%" }, { ...original.sk.numbers[2], value: "48,2" }] };
  assert.doesNotThrow(() => merge([{ ...original, sk }, words("AMD", { evidence: [] })]));
  assert.throws(() => merge([{ ...original, sk: { ...sk, whatHappened: ["Cena je 7,5 percent pod 20-dňovým maximom.", sk.whatHappened[1]] } }, words("AMD", { evidence: [] })]), /figures not in the input|Slovak prose figures differ/);
});

test("incident: AMD, AMZN, CRWD and TSLA bilingual fragments retain their figures", () => {
  const fragments = [
    ["AMD", "above the 200-day average and RSI at 70.7", "nad 200-dňovým priemerom a RSI na 70,7"],
    ["AMZN", "price above its 20-, 50- and 200-day averages", "cena nad 20-, 50- a 200-dňovými priemermi"],
    ["CRWD", "The stock fell 4.81% on the latest session", "Akcia v poslednej seanse klesla o 4,81%"],
    ["TSLA", "the price 3.54% below its 200-day average and 60-day relative strength", "cena 3,54% pod 200-dňovým priemerom a 60-dňová relatívna sila"],
  ];
  for (const [symbol, en, sk] of fragments) {
    assert.equal(sameFigureValues(en, sk), true, symbol);
    assert.equal(sameProtectedTokens(en, sk), true, symbol);
  }
});

test("incident: AMZN 20-, 50- and 200-day windows do not invent 50", () => {
  const phrase = "regime, price above its 20-, 50- and 200-day averages and positive momentum";
  assert.deepEqual(inventedFigures([phrase], {}), []);
  assert.deepEqual(inventedFigures(["cena nad 20-, 50- a 200-dňovými priemermi"], {}), []);
  assert.deepEqual(inventedFigures(["cena nad 20-, 50- a 200-dňové priemery"], {}), []);
  assert.deepEqual(inventedFigures(["price above its 20-, 55- and 200-day averages"], {}), [20, 55]);
  const original = words("NVDA");
  const changed = { ...original.sk, whatHappened: ["Cena je 7.4 percent pod 50-dňovým maximom.", original.sk.whatHappened[1]] };
  assert.throws(() => merge([{ ...original, sk: changed }, words("AMD", { evidence: [] })]), /Slovak prose figures differ/);
});

test("incident: CRWD 4.81 latest-session fall still needs an input figure", () => {
  const phrase = "The stock fell 4.81% on the latest session and is rated Neutral.";
  assert.deepEqual(inventedFigures([phrase], { technicals: { return1dPercent: -4.8 } }), [4.81]);
  assert.deepEqual(inventedFigures([phrase], { technicals: { return1dPercent: -4.81 } }), []);
});

test("incident: TSLA signed MA distance, two-decimal rounding and 60-day window", () => {
  const phrase = "The entry regime is downtrend, with the price 3.54% below its 200-day average and negative 60-day relative strength.";
  assert.deepEqual(inventedFigures([phrase], { technicals: { vsMa200Percent: -3.543 } }), []);
  assert.deepEqual(inventedFigures([phrase], { technicals: { vsMa200Percent: -3.55 } }), [3.54]);
  assert.deepEqual(inventedFigures(["relative strength fell 60%"], {}), [60]);
});

test("incident: AMD 70.7 is one token and 0.7 context cannot point inside it", () => {
  const phrase = "above the 200-day average and RSI at 70.7.";
  assert.deepEqual(figureValuesIn(phrase), [200, 70.7]);
  assert.deepEqual(inventedFigures([phrase], { technicals: { rsi14: 70.7 } }), []);
  assert.equal(figureContext([phrase], 0.7), "no context");
  assert.deepEqual(figureValuesIn("70.7, 0.7, 1,200.50, 50%"), [70.7, 0.7, 1200.5, 50]);
  assert.deepEqual(inventedFigures(["RSI at 70.7 and a 0.7% fall"], { technicals: { rsi14: 70.7 } }), [0.7]);
});

test("scientific notation and changed indicator tokens cannot bypass the guard", () => {
  assert.deepEqual(figureValuesIn("1e9 and 3.5E-2"), [1e9, 0.035]);
  assert.deepEqual(inventedFigures(["Revenue reached 1e9"], { score: 1 }), [1e9]);
  assert.equal(sameProtectedTokens("Q3 FY2026 RSI MA200 SPY", "Q4 FY2027 RSI MA50 SPY"), false);
  const original = words("NVDA", { verdict: "Q3 FY2026 results above MA200, RSI stable versus SPY." });
  const changed = { ...original.sk, verdict: "Q4 FY2027 výsledky nad MA50, RSI stabilné oproti SPY." };
  assert.throws(() => merge([{ ...original, sk: changed }, words("AMD", { evidence: [] })]), /Slovak prose figures differ/);
});

test("figures: labels are not figures", () => {
  const inp = { score: 19 };
  const ok = (t) => assert.deepEqual(inventedFigures([t], inp), [], t);
  ok("Price is under the 200-day moving average and the 50 day line.");
  ok("52-week high, 12-month return, 3-year view, 10 days ago, 5d and 2w moves.");
  ok("Below MA200, SMA50 and EMA 21.");
  ok("Q3 results, 2Q26 guide, FY26 and fiscal 2027, FY2027, H2 ramp.");
  ok("Guidance in 2027 and since 2025.");
  ok("Top 5 holding, 3rd quarter, list item 2, (1) first, #2 pick.");
  ok("Filed an 8-K and a 10-Q, Form 4, Item 2.02, 13D.");
  ok("Starter is about 1/3 of a full position, or 33% of a full position.");
  ok("1. First point\n2. Second point");
  assert.deepEqual(inventedFigures(["the invented 999-day average"], inp), [999]);
});

test("figures: real figures next to labels are still caught", () => {
  const inp = { score: 19, below: 7.4 };
  assert.deepEqual(inventedFigures(["200-day average at 310.5"], inp), [310.5]);
  assert.deepEqual(inventedFigures(["Q3 revenue 5.2 billion and backlog 40"], inp), [5.2, 40]);
  assert.deepEqual(inventedFigures(["MA200 up 12 percent, 8-K shows 900 million shares"], inp), [12, 900]);
  assert.deepEqual(inventedFigures(["FY26 EPS 4.1, price 2,150"], inp), [4.1, 2150]);
  assert.deepEqual(inventedFigures(["close fell -5.2 percent over 30 days"], inp), [-5.2]);
});

test("each idea can cite only its own figures and URLs", () => {
  assert.throws(() => merge([words("NVDA", { whatHappened: ["AMD held EUR 0.", "The price was 999."] }), words("AMD", { evidence: [] })]), /figures not in the input/);
  assert.throws(() => merge([words("NVDA", { evidence: [{ url: U1, label: "own" }, { url: U3, label: "other symbol" }] }), words("AMD", { evidence: [] })]), /evidence url not in the input/);
  assert.deepEqual(inventedFigures(["generic 25, 50 and 100 percent"], { score: 19 }), [25, 50, 100]);
});

test("a figure that belongs to another item's context is rejected for this item", () => {
  const amd = ctx("AMD", [U3]);
  amd.technicals = { ...amd.technicals, close: 77.7, rsi14: 31.9 };
  const i = input({ symbols: [ctx("NVDA", [U1, U2]), amd] });
  const own = (symbol, text, over = {}) => words(symbol, { whatHappened: [text, "EPS beat stated in the release."], ...over });
  assert.throws(() => merge([own("NVDA", "Price closed at 77.7."), words("AMD", { evidence: [] })], i), /NVDA: figures not in the input: 77.7/);
  assert.throws(() => merge([words("NVDA"), own("AMD", "RSI was 48.2 and 7.4 percent under the high.", { evidence: [] })], i), /AMD: figures not in the input/);
  assert.doesNotThrow(() => merge([words("NVDA"), own("AMD", "Price closed at 77.7, RSI 31.9.", { evidence: [], numbers: [{ label: "Score", value: "19 of 25" }, { label: "Close", value: "77.7" }, { label: "RSI", value: "31.9" }] })], i));
});

test("a downgrade only moves a buy to WATCH EUR 0 and keeps the signature; a conflict adds a note", () => {
  const down = { reason: "The cited 8-K reports a guidance cut.", evidenceUrl: U1 };
  const { ideas } = merge([words("NVDA", { downgrade: down, conflict: { reason: "Rules and the 10-Q disagree.", evidenceUrl: U2 } }), words("AMD", { evidence: [] })]);
  const nvda = ideas.find((i) => i.symbol === "NVDA");
  assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow, nvda.downgradedFrom], ["WATCH", "NONE", 0, 0, "EUR 0", "ADD"]);
  assert.equal(nvda.signature, "ADD|Very strong|Strong|Good|ADD_THIRD", "the signature stays the deterministic one, so tomorrow it is not new again");
  assert.equal(nvda.conflictNote, "Rules and the 10-Q disagree.");
  assert.equal(nvda.unconfirmed, true);
  assert.throws(() => merge([words("NVDA", { downgrade: { reason: "r", evidenceUrl: "https://example.com/other" } }), words("AMD", { evidence: [] })]), /cites a url not in the input/);
  const i2 = input({ signals: [sig("NVDA", { action: "REDUCE", sizeTier: "NONE", amountMinEur: 100, amountMaxEur: 200 })] });
  const r = merge([words("NVDA", { downgrade: down })], i2);
  assert.equal(r.ideas[0].action, "REDUCE", "a downgrade cannot remove a REDUCE");
  assert.match(r.notes[0], /downgrade ignored/);
});

test("hash ignores generatedAt and previousIdeas and follows rule version, inputs, prompt, model and mode", () => {
  const base = { input: input(), prompt: "p", model: "sonnet" };
  const h = judgeHash(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(judgeHash({ ...base, input: input({ generatedAt: "later", previousIdeas: [{ symbol: "X" }] }) }), h);
  assert.notEqual(judgeHash({ ...base, input: input({ ruleConfigVersion: "2026-10-07.1" }) }), h);
  assert.notEqual(judgeHash({ ...base, input: input({ portfolio: { ...input().portfolio, cashEur: 601 } }) }), h);
  assert.notEqual(judgeHash({ ...base, prompt: "q" }), h);
  assert.notEqual(judgeHash({ ...base, model: "opus" }), h);
  assert.notEqual(judgeHash({ ...base, agentMode: true }), h);
});

test("agent mode allows read-only file tools only", () => {
  const args = agentModeArgs({ model: "sonnet" });
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob");
  assert.equal(args[args.indexOf("--allowedTools") + 1], "Read,Grep,Glob");
  assert.match(args[args.indexOf("--disallowedTools") + 1], /Bash.*Edit.*Write.*WebFetch.*WebSearch/);
  assert.equal(args.includes("--max-budget-usd"), false);
  assert.ok(args.includes("--no-session-persistence"));
  const env = (o) => JSON.stringify({ is_error: false, result: "{}", num_turns: 3, total_cost_usd: 0.1, usage: {}, modelUsage: { m: {} }, permission_denials: [], ...o });
  assert.equal(parseAgentEnvelope(env(), "sonnet", 8).usage.turns, 3);
  assert.throws(() => parseAgentEnvelope(env({ num_turns: 9 }), "sonnet", 8), /the cap is 8/);
  assert.throws(() => parseAgentEnvelope(env({ permission_denials: [{ tool_name: "Bash" }] }), "sonnet", 8), /not allowed/);
});

// ---------- stubbed model process ----------
const envelope = (text, over = {}) => JSON.stringify({ type: "result", is_error: false, result: text, num_turns: 1, total_cost_usd: 0.0123, usage: { input_tokens: 11, output_tokens: 22, cache_read_input_tokens: 33, cache_creation_input_tokens: 44 }, modelUsage: { "claude-sonnet-stub": {} }, permission_denials: [], ...over });
function stub() {
  const dir = mkdtempSync(join(tmpdir(), "judge-stub-"));
  writeFileSync(join(dir, "response.txt"), "");
  writeFileSync(join(dir, "claude"), `#!/usr/bin/env node
const fs = require("fs"); const d = ${JSON.stringify(dir)};
let stdin = ""; process.stdin.on("data", (c) => { stdin += c; });
process.stdin.on("end", () => {
  fs.appendFileSync(d + "/calls.jsonl", JSON.stringify({ args: process.argv.slice(2), stdinLength: stdin.length, hasInput: stdin.includes("Input:"), cwdFiles: fs.readdirSync(process.cwd()) }) + "\\n");
  const queue = d + "/queue.json";
  let out = fs.readFileSync(d + "/response.txt", "utf8");
  if (fs.existsSync(queue)) { const q = JSON.parse(fs.readFileSync(queue, "utf8")); if (q.length) { out = q.shift(); fs.writeFileSync(queue, JSON.stringify(q)); } }
  process.stdout.write(out);
});
`);
  chmodSync(join(dir, "claude"), 0o755);
  return { dir, respond: (text) => writeFileSync(join(dir, "response.txt"), text), queue: (list) => writeFileSync(join(dir, "queue.json"), JSON.stringify(list)), calls: () => (existsSync(join(dir, "calls.jsonl")) ? readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []) };
}
const flag = (args, name) => args[args.indexOf(name) + 1];

test("the single call has no tools and the requested model", async () => {
  const s = stub(); s.respond(envelope("{}"));
  const old = process.env.PATH; process.env.PATH = `${s.dir}:${old}`;
  try { await callAgentNoTools({ agent: "claude", model: "sonnet", timeoutS: 30 }, "prompt text", s.dir); } finally { process.env.PATH = old; }
  const { args } = s.calls()[0];
  assert.equal(flag(args, "--tools"), "", "--tools is followed by an empty string");
  assert.equal(args.includes("--max-budget-usd"), false);
  assert.equal(flag(args, "--model"), "sonnet");
  assert.ok(!args.some((a) => /WebSearch|WebFetch|allowedTools|Read|Bash/i.test(a)), "no tool is named");
});

function mockWeb({ skipDay = false, skipHash = false, inputOverride = null } = {}) {
  const seen = { posts: [], gets: [], auth: [], budgets: [] };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => { body += c; });
    req.on("end", () => {
      seen.auth.push(req.headers.authorization);
      const send = (o, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.method === "POST" && req.url === "/api/ingest/ideas") { seen.posts.push(JSON.parse(body)); return send({ recorded: true, stored: 1 }); }
      if (req.method === "POST" && req.url === "/api/ingest/ai-budget") { seen.budgets.push(JSON.parse(body)); return send({ allowed: true }); }
      if (req.url.startsWith("/api/ingest/judge-input")) { seen.gets.push(req.url); return send(inputOverride ?? input()); }
      if (req.url.startsWith("/api/ingest/ideas?")) { seen.gets.push(req.url); return send({ skip: req.url.includes("inputHash") ? skipHash : skipDay }); }
      send({ error: "not found" }, 404);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ seen, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}
function runJudge(args, { s, env = {} }) {
  const out = mkdtempSync(join(tmpdir(), "judge-out-"));
  const gate = join(out, "gate.json"); writeFileSync(gate, JSON.stringify({ symbols: ["NVDA", "AMD"] }));
  const gatedArgs = args.includes("--symbols-file") || args.includes("--force") ? args : [...args, "--symbols-file", gate];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...gatedArgs], { env: { ...process.env, PATH: `${s.dir}:${process.env.PATH}`, INGEST_TOKEN: "test-token", SCAN_OUT_DIR: out, ...env } });
    let err = ""; child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, err, out }));
  });
}
const both = [words("NVDA"), words("AMD", { evidence: [] })];

test("end to end: one call for the changed signals, fixed decisions kept, tokens recorded, skips honoured", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA")], notes: "n" })));
  const prev = [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }];
  let web = await mockWeb({ inputOverride: input({ previousIdeas: prev }) });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--max-symbols", "7"], { s });
    assert.equal(r.code, 0, r.err);
    assert.equal(s.calls().length, 1, "exactly one model call");
    assert.equal(s.calls()[0].args.includes("--max-budget-usd"), false);
    assert.equal(flag(s.calls()[0].args, "--tools"), "");
    assert.ok(web.seen.gets.some((g) => g.includes("maxSymbols=7")));
    const post = web.seen.posts[0];
    assert.deepEqual(post.ideas.map((i) => i.symbol), ["NVDA"], "AMD signal unchanged, so no alert and no model text asked for it");
    assert.equal(post.ideas[0].action, "ADD");
    assert.equal(post.ideas[0].signature, "ADD|Very strong|Strong|Good|ADD_THIRD");
    assert.equal(post.ideas[0].sizeTier, "ADD_THIRD");
    assert.equal(post.run.status, "ok");
    assert.equal(post.run.ruleConfigVersion, "2026-10-06.1");
    assert.deepEqual(post.run.usage, { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheCreationTokens: 44, turns: 1 });
    assert.equal(post.run.costUsd, 0.0123);
    assert.ok(web.seen.auth.every((a) => a === "Bearer test-token"));
    assert.match(r.err, /1 model call\(s\).*tokens in 11 out 22 cache read 33 cache created 44, turns 1, cost \$0\.0123/);
  } finally { await web.close(); }
});

test("only the changed symbols reach the model, and an empty change list makes no call", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA")] })));
  const prev = [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }];
  let web = await mockWeb({ inputOverride: input({ previousIdeas: prev }) });
  try {
    await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.ok(s.calls()[0].hasInput);
  } finally { await web.close(); }
  const s2 = stub();
  web = await mockWeb({ inputOverride: input({ previousIdeas: [{ symbol: "AMD", signature: "WATCH|Very strong|Strong|Good|NONE" }, { symbol: "NVDA", signature: "ADD|Very strong|Strong|Good|ADD_THIRD" }] }) });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s: s2 });
    assert.equal(r.code, 0);
    assert.equal(s2.calls().length, 0);
    assert.match(r.err, /no model call/);
    assert.equal(web.seen.posts.length, 0);
  } finally { await web.close(); }
});

test("a weekly JSON cutoff records reset time and leaves judge input pending", async () => {
  const s = stub(); s.respond(envelope("Weekly usage limit reached. Resets at 2026-10-11T00:00:00Z", { is_error: true, subtype: "weekly_usage_limit" }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 5);
    assert.match(r.err, /ANTHROPIC CUTOFF: weekly resets 2026-10-11T00:00:00.000Z after 0 tickers/);
    assert.equal(web.seen.posts.length, 0);
    assert.deepEqual([web.seen.budgets.at(-1).status, web.seen.budgets.at(-1).resetAt, web.seen.budgets.at(-1).inputTokens], ["cutoff", "2026-10-11T00:00:00.000Z", 11]);
  } finally { await web.close(); }
});

test("no portfolio baseline: the run goes on, the data-only signal is posted with owner amounts 0", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  const bare = input({ portfolio: null, signals: input().signals.map((x) => ({ ...x, amountMinEur: 0, amountMaxEur: 0 })) });
  const web = await mockWeb({ inputOverride: bare });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.match(r.err, /no portfolio baseline: signals come from data alone/);
    const nvda = web.seen.posts[0].ideas.find((i) => i.symbol === "NVDA");
    assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMinEur, nvda.amountMaxEur, nvda.plan.amountNow], ["ADD", "ADD_THIRD", 0, 0, "EUR 0"]);
  } finally { await web.close(); }
});

test("a new same-day input runs, an unchanged input skips, and --force reruns", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  let web = await mockWeb({ skipDay: true });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.equal(s.calls().length, 1);
    const forced = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--force"], { s });
    assert.equal(forced.code, 0, forced.err);
    assert.equal(s.calls().length, 2);
  } finally { await web.close(); }
  web = await mockWeb({ skipHash: true });
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.match(r.err, /same input already judged/);
    assert.equal(s.calls().length, 2, "no new call");
    assert.equal(web.seen.posts.length, 0);
  } finally { await web.close(); }
});

test("a downgrade from the model is applied by the script, never an upgrade", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA", { downgrade: { reason: "Guidance cut in the cited release.", evidenceUrl: U1 } }), words("AMD", { evidence: [] })] })));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    const nvda = web.seen.posts[0].ideas.find((i) => i.symbol === "NVDA");
    assert.deepEqual([nvda.action, nvda.sizeTier, nvda.amountMaxEur, nvda.downgradedFrom], ["WATCH", "NONE", 0, "ADD"]);
  } finally { await web.close(); }
});

test("invalid wording is retried once, then a failed run is recorded and the exit is 1", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA", { verdict: "Cash left EUR 510." }), words("AMD", { evidence: [], verdict: "Target 777." })] })));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.equal(s.calls().length, 2, "no third call");
    assert.equal(web.seen.posts[0].run.status, "failed");
    assert.deepEqual(web.seen.posts[0].ideas, []);
    assert.match(web.seen.posts[0].run.error, /figures not in the input/);
  } finally { await web.close(); }
});

test("a symbol that still fails after the retry is skipped, the others are stored, exit 0", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: [words("NVDA", { verdict: "Cash left EUR 510." }), words("AMD", { evidence: [] })] })));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.equal(s.calls().length, 2, "the retry happens once and never a third time");
    assert.match(r.err, /SKIPPED NVDA: figures not in the input: 510/);
    assert.match(r.err, /POST ok.*skipped NVDA/);
    assert.equal(web.seen.posts.length, 1);
    assert.equal(web.seen.posts[0].run.status, "ok");
    assert.deepEqual(web.seen.posts[0].ideas.map((i) => i.symbol), ["AMD"]);
  } finally { await web.close(); }
});

test("a symbol fixed by the retry is stored and nothing is skipped", async () => {
  const s = stub();
  const changedReason = words("NVDA", { conflict: { reason: "Guidance fell 7.4 percent.", evidenceUrl: U1 } });
  changedReason.sk.conflictReason = "Výhľad klesol 19 percent.";
  s.queue([envelope(JSON.stringify({ ideas: [changedReason, words("AMD", { evidence: [] })] })), envelope(JSON.stringify({ ideas: [words("NVDA", { conflict: { reason: "Guidance fell 7.4 percent.", evidenceUrl: U1 } })] }))]);
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 0, r.err);
    assert.equal(s.calls().length, 2);
    assert.doesNotMatch(r.err, /SKIPPED/);
    assert.deepEqual(web.seen.posts[0].ideas.map((i) => i.symbol).sort(), ["AMD", "NVDA"]);
  } finally { await web.close(); }
});

test("a second call is allowed regardless of reported cost", async () => {
  const bad = (cost) => envelope(JSON.stringify({ ideas: [words("NVDA", { verdict: "Cash left EUR 510." })] }), { total_cost_usd: cost });
  const s = stub(); s.queue([bad(0.6), bad(0.01)]);
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.equal(s.calls().length, 2);
    assert.equal(s.calls()[1].args.includes("--max-budget-usd"), false);
  } finally { await web.close(); }
});

test("a rate limit is not retried", async () => {
  const s = stub(); s.respond(envelope("rate limit reached", { is_error: true }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 5);
    assert.equal(s.calls().length, 1);
    assert.match(r.err, /ANTHROPIC CUTOFF: rate limit resets unknown after 0 tickers/);
    assert.equal(web.seen.posts.length, 0);
  } finally { await web.close(); }
});

test("a second turn is rejected as tool use in the default mode", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 2 }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base], { s });
    assert.equal(r.code, 1);
    assert.match(r.err, /tool use is not allowed/);
  } finally { await web.close(); }
});

test("agent mode: read-only tools, prepared files in the working directory, turn cap", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 4 }));
  const web = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web.base, "--agent-mode", "--max-turns", "6"], { s });
    assert.equal(r.code, 0, r.err);
    const call = s.calls()[0];
    assert.equal(flag(call.args, "--tools"), "Read,Grep,Glob");
    assert.match(flag(call.args, "--disallowedTools"), /Bash/);
    assert.deepEqual(call.cwdFiles.sort(), ["facts.json", "ideas-history.json", "signals.json", "technicals.json"]);
    assert.equal(web.seen.posts[0].run.usage.turns, 4);
    assert.match(r.err, /agent\(max 6 turns\)/);
  } finally { await web.close(); }
  const s2 = stub(); s2.respond(envelope(JSON.stringify({ ideas: both }), { num_turns: 9 }));
  const web2 = await mockWeb();
  try {
    const r = await runJudge(["--as-of", "2026-10-05", "--base-url", web2.base, "--agent-mode", "--max-turns", "6"], { s: s2 });
    assert.equal(r.code, 1);
    assert.match(r.err, /the cap is 6/);
  } finally { await web2.close(); }
});

test("dry run with an input file needs no token, posts nothing and writes the payload", async () => {
  const s = stub(); s.respond(envelope(JSON.stringify({ ideas: both })));
  const file = join(mkdtempSync(join(tmpdir(), "judge-in-")), "input.json"); writeFileSync(file, JSON.stringify(input()));
  const r = await runJudge(["--as-of", "2026-10-05", "--dry-run", "--input-file", file], { s, env: { INGEST_TOKEN: "", CLAUDE_CODE_OAUTH_TOKEN: "synthetic-offline-token", HOME: "/nonexistent" } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.err, /dry run: nothing posted/);
  assert.doesNotMatch(r.err, /USAGE /);
  const name = readdirSync(r.out).find((n) => /^judge-payload-/.test(n));
  const payload = JSON.parse(readFileSync(join(r.out, name), "utf8"));
  assert.equal(payload.ideas.length, 2);
  assert.equal(payload.run.status, "ok");
});

test("paired reason and evidence figures must match; identical figures pass", () => {
  const reason = "Guidance fell 7.4 percent.";
  const good = words("NVDA", { conflict: { reason, evidenceUrl: U1 }, evidence: [{ url: U1, label: "Release 7.4 percent" }, { url: U2, label: "10-Q" }] });
  assert.doesNotThrow(() => merge([good, words("AMD", { evidence: [] })]));
  const bad = structuredClone(good); bad.sk.conflictReason = "Výhľad klesol 19 percent.";
  assert.throws(() => merge([bad, words("AMD", { evidence: [] })]), /Slovak prose figures differ/);
  const badLabel = structuredClone(good); badLabel.sk.evidence[0].label = "Správa 19 percent";
  assert.throws(() => merge([badLabel, words("AMD", { evidence: [] })]), /Slovak prose figures differ/);
});

test("ADR-001 wording is checked in both languages", () => {
  assert.throws(() => merge([words("NVDA", { verdict: "You should buy now." }), words("AMD", { evidence: [] })]), /ADR-001/);
  const sk = words("NVDA"); sk.sk.verdict = "Kúp teraz.";
  assert.throws(() => merge([sk, words("AMD", { evidence: [] })]), /ADR-001/);
});

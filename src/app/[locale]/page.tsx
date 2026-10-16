import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { StateStrip, type StateChange } from "@/components/kit/state-strip";
import { kitState } from "@/components/kit";
import { Close, Hero, Proof, StateBoard, Steps, TierSplit, type BoardRow } from "@/components/landing/sections";
import { coreRulesMet } from "@/components/status-slider";
import { recordStartDate } from "@/data/launch-facts";
import { latestStateChanges } from "@/data/state-changes";
import { latestScores } from "@/data/store";
import { displayScore } from "@/engine/display-score";
import { flags } from "@/config/flags";
import { fill, formatDate, getMessages } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { pageMetadata } from "@/i18n/metadata";
import { stateKey } from "@/i18n/score-text";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { resolveSource } from "@/waitlist/source";
import { resolveLocale, type LocaleParams } from "./locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return pageMetadata(locale, "", null, getMessages(locale).meta.homeDescription);
}

type HomeProps = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

async function Home({ params, searchParams }: HomeProps) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const k = getKitMessages(locale);
  const [data, moved] = await Promise.all([latestScores(), latestStateChanges()]);
  const rows = data.rows;
  const ranked = [...rows].sort((a, b) => Number(b.result.state === "Setup met (>=18)") - Number(a.result.state === "Setup met (>=18)") || b.result.total - a.result.total || a.instrument.ticker.localeCompare(b.instrument.ticker));
  const waitlist = flags().WAITLIST;
  const adviceOutput = flags().ADVICE_OUTPUT;
  const query = waitlist ? await searchParams : undefined;
  const facts = waitlist ? { tickers: data.sample || rows.length === 0 ? null : rows.length, lastScore: data.sample ? null : data.lastUpdated, recordStart: data.sample || rows.length === 0 ? null : await recordStartDate() } : null;
  // Counts per state are shown only for live data. Sample data would present invented figures as today's.
  const counts = data.sample || rows.length === 0 ? null : (Object.fromEntries(stateOrder.map((s) => [s, 0])) as Record<StateKey, number>);
  if (counts) for (const row of rows) counts[displayScore(stateKey(row.result.state), row.result.ruleHits).state] += 1;
  const view = (row: (typeof rows)[number]) => {
    const display = displayScore(stateKey(row.result.state), row.result.ruleHits);
    const pullback = display.state === "watch" && row.result.pullbackInUptrend;
    return { display, state: kitState(display.state, pullback), label: pullback ? m.states.pullback : m.states[display.state] };
  };
  const board: BoardRow[] = ranked.slice(0, 5).map((row) => {
    const v = view(row);
    return { ticker: row.instrument.ticker, name: row.instrument.name, percent: v.display.percent, state: v.state, label: v.label, href: `/${locale}/company/${row.instrument.ticker}` };
  });
  const top = ranked[0];
  const topView = top ? view(top) : null;
  const specimen = top && topView ? { ticker: top.instrument.ticker, result: top.result, percent: topView.display.percent, state: topView.state, label: topView.label, known: topView.display.coreKnown, total: topView.display.coreTotal, met: coreRulesMet(top.result.ruleHits) } : null;
  const changes: StateChange[] = moved.map(({ ticker, from, to }) => {
    const [fromLabel, toLabel] = [m.status.labels[from], m.status.labels[to]];
    return { ticker, from: kitState(from), to: kitState(to), fromLabel, toLabel, href: `/${locale}/company/${ticker}`, sentence: fill(k.strip.changed, { ticker, from: fromLabel, to: toLabel }) };
  });
  const session = top?.result.asOf ?? "";

  return (
    <>
      <Hero locale={locale} rows={board} total={rows.length} sample={data.sample} waitlist={waitlist} lastUpdated={data.lastUpdated} stale={data.stale} />
      {data.lastUpdated ? (
        <div className="frame" style={{ marginTop: "var(--s5)" }}>
          <StateStrip label={fill(k.strip.label, { date: formatDate(locale, session) })} changes={changes} empty={k.strip.empty} pauseLabel={k.strip.pause} playLabel={k.strip.play} />
        </div>
      ) : null}
      <Steps locale={locale} specimen={specimen} />
      <StateBoard locale={locale} counts={counts} adviceOutput={adviceOutput} />
      {waitlist ? <TierSplit locale={locale} /> : null}
      <Proof locale={locale} facts={facts} />
      <Close locale={locale} waitlist={waitlist} source={resolveSource(query, "landing")} />
    </>
  );
}

export default withPageLog("/", Home);

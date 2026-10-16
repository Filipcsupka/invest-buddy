import { withPageLog } from "@/app/page-log";
import Link from "next/link";
import type { Metadata } from "next";
import { DataStatus } from "@/components/data-status";
import { IconArrowRight } from "@/components/icons";
import { StateChip, kitState } from "@/components/kit";
import { Close, Promises, Proof, StateLedger, TierSplit, Weights } from "@/components/landing/sections";
import { Specimen } from "@/components/landing/specimen";
import styles from "@/components/landing/landing.module.css";
import { recordStartDate } from "@/data/launch-facts";
import { latestScores } from "@/data/store";
import { displayScore } from "@/engine/display-score";
import { flags } from "@/config/flags";
import { getMessages } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
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
  const data = await latestScores();
  const rows = data.rows;
  const ranked = [...rows].sort((a, b) => Number(b.result.state === "Setup met (>=18)") - Number(a.result.state === "Setup met (>=18)") || b.result.total - a.result.total || a.instrument.ticker.localeCompare(b.instrument.ticker));
  const top = ranked[0];
  const waitlist = flags().WAITLIST;
  const adviceOutput = flags().ADVICE_OUTPUT;
  const query = waitlist ? await searchParams : undefined;
  const launch = waitlist ? getLaunchMessages(locale) : null;
  const facts = waitlist ? { tickers: data.sample || rows.length === 0 ? null : rows.length, lastScore: data.sample ? null : data.lastUpdated, recordStart: data.sample || rows.length === 0 ? null : await recordStartDate() } : null;
  // Counts per state are shown only for live data. Sample data would present invented figures as today's.
  const counts = data.sample || rows.length === 0 ? null : (Object.fromEntries(stateOrder.map((s) => [s, 0])) as Record<StateKey, number>);
  if (counts) for (const row of rows) counts[displayScore(stateKey(row.result.state), row.result.ruleHits).state] += 1;
  const topDisplay = top ? displayScore(stateKey(top.result.state), top.result.ruleHits) : null;
  const lockStatus = top && topDisplay ? <StateChip state={kitState(topDisplay.state, topDisplay.state === "watch" && top.result.pullbackInUptrend)} label={topDisplay.state === "watch" && top.result.pullbackInUptrend ? m.states.pullback : m.states[topDisplay.state]} /> : null;

  return (
    <>
      <section className={`frame ${styles.hero}`} aria-label={m.home.title}>
        <div className={styles.heroCopy}>
          <h1 className="display">{m.home.title}</h1>
          <p className="lede">{m.home.lede}</p>
          <div className="actions">
            <Link className="button" href={`/${locale}/dashboard`}>
              {m.home.primary}
              <IconArrowRight />
            </Link>
            <Link className="button secondary" href={`/${locale}/methodology`}>
              {m.home.secondary}
            </Link>
            {launch ? (
              <Link className="button secondary" href="#waitlist">
                {launch.landing.ctaWaitlist}
              </Link>
            ) : null}
          </div>
          <div className={styles.heroStatus}>
            <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
          </div>
        </div>
        {top ? <Specimen locale={locale} instrument={top.instrument} result={top.result} sample={data.sample} /> : null}
      </section>

      <Weights locale={locale} />
      <StateLedger locale={locale} counts={counts} adviceOutput={adviceOutput} />
      <Promises locale={locale} sample={data.sample} />
      {waitlist ? <TierSplit locale={locale} status={lockStatus} /> : null}
      <Proof locale={locale} facts={facts} />
      <Close locale={locale} waitlist={waitlist} source={resolveSource(query, "landing")} />
    </>
  );
}

export default withPageLog("/", Home);

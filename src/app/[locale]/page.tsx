import Link from "next/link";
import type { Metadata } from "next";
import { Datasheet } from "@/components/datasheet";
import { IconArrowRight } from "@/components/icons";
import { RuleBook, StateScale } from "@/components/method";
import { latestScores } from "@/data/store";
import { DataStatus } from "@/components/data-status";
export const dynamic = "force-dynamic";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "./locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return pageMetadata(locale, "", null, getMessages(locale).meta.homeDescription);
}

export default async function Home({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const data = await latestScores();
  const rows = data.rows;
  const ranked = [...rows].sort((a, b) => Number(b.result.state === "Setup met (>=18)") - Number(a.result.state === "Setup met (>=18)") || b.result.total - a.result.total || a.instrument.ticker.localeCompare(b.instrument.ticker));
  const top = ranked[0];

  return (
    <>
      <section className="frame hero">
        <div className="hero-copy">
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
          </div>
        </div>
        {top ? <Datasheet locale={locale} instrument={top.instrument} result={top.result} sample={data.sample} /> : <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />}
      </section>

      <section className="frame ledger" aria-labelledby="build">
        <div className="ledger-head">
          <h2 id="build">{m.home.buildTitle}</h2>
          <p className="prose">{m.home.buildBody}</p>
        </div>
        <RuleBook locale={locale} />
      </section>

      <section className="frame ledger" aria-labelledby="states">
        <div className="ledger-head">
          <h2 id="states">{m.home.statesTitle}</h2>
          <p className="prose">{m.home.statesBody}</p>
        </div>
        <StateScale locale={locale} />
      </section>

      <section className="frame ledger ledger-quiet" aria-labelledby="leaves-out">
        <div className="ledger-head">
          <h2 id="leaves-out">{m.home.leavesOutTitle}</h2>
        </div>
        <p className="prose">{m.home.leavesOutBody}</p>
      </section>

      <section className="frame ledger ledger-quiet" aria-labelledby="record">
        <div className="ledger-head">
          <h2 id="record">{m.home.recordTitle}</h2>
        </div>
        <div>
          <p className="prose">{m.home.recordBody}</p>
          <div className="actions">
            <Link className="button" href={`/${locale}/dashboard`}>
              {m.home.primary}
              <IconArrowRight />
            </Link>
            <Link className="button secondary" href={`/${locale}/track-record`}>
              {m.home.recordLink}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

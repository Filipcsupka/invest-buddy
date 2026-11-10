import Link from "next/link";
import type { ReactNode } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthDialogLink } from "@/components/auth/auth-dialog";
import { Disclaimer } from "@/components/disclaimer";
import { SampleStamp } from "@/components/operator-disclosure";
import { paidIds } from "@/components/landing/tier-rows";
import { FEATURE_TIERS, TIERS, TIER_LIMITS, type TierId } from "@/config/tiers";
import { fill, formatScorePercent, getMessages, plural, type Locale } from "@/i18n";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { PLUS_PRICE, formatEur, yearlyPerMonth } from "@/app/[locale]/pricing/plans";
import { AppPreview } from "./app-preview";
import { ChipTag, type Chip } from "./chip";
import { G, Mark } from "./glyphs";
import { specimenRow } from "./sample-data";
import { RuleBand, ScoreStory } from "./sections";
import { SecFacts } from "./sec-facts";
import { Checklist, Comparison, NumberTiles, RecordSample, ScannerSample, UniverseGlance } from "./story-visuals";
import { SignedInSwap } from "./signed-in-swap";
import { StickyCta } from "./sticky-cta";
import { WelcomeMotion } from "./welcome-motion";
import w from "./welcome.module.css";
import s from "./story.module.css";

/*
 * The Welcome story: everything below the hero, in the order of the owner brief (2026-11-10). One server component tree, no store, no
 * request API, so the page HTML stays the same for every visitor. Sample figures come from the invented sample universe and say so; the
 * one real block (SEC filings) is labelled real and carries its source and access date.
 */

function Head({ id, title, lede, aside }: { id: string; title: string; lede?: string; aside?: ReactNode }) {
  return (
    <header className={w.head}>
      <div>
        <h2 id={id} className={w.h2}>{title}</h2>
        {lede ? <p className={w.lede}>{lede}</p> : null}
      </div>
      {aside}
    </header>
  );
}

/* ---------- 1. The problem, and what InvestBuddy is ---------- */

/** "11% → 22%" from the engine's rule detail, as numbers. */
const growth = (detail: string | undefined) => {
  const m = detail?.match(/(-?\d+(?:\.\d+)?)%\s*→\s*(-?\d+(?:\.\d+)?)%/);
  return m ? { before: Number(m[1]), now: Number(m[2]) } : null;
};
const drawdown = (detail: string | undefined) => Number(detail?.match(/(-?\d+(?:\.\d+)?)%/)?.[1] ?? NaN);

function Intro({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeStoryMessages(locale).intro;
  const row = specimenRow();
  const hits = new Map(row.result.ruleHits.map((hit) => [hit.id, hit]));
  const g = growth(hits.get("revenue-acceleration")?.detail);
  const dd = drawdown(hits.get("dip")?.detail);
  const pct = (n: number) => formatScorePercent(locale, n);
  // Three judge notes on the specimen, each tied to a real rule hit of the sample engine run: two that hold, one that missed.
  const notes = [
    { id: "revenue-acceleration" as const, text: g ? fill(t.judgeLines.revenue, { now: pct(g.now), before: pct(g.before) }) : null },
    { id: "above-ma" as const, text: t.judgeLines.trend },
    { id: "dip" as const, text: Number.isFinite(dd) ? fill(t.judgeLines.dip, { drawdown: pct(dd) }) : null },
  ].flatMap((note) => {
    const hit = hits.get(note.id);
    return hit && !hit.unknown && note.text ? [{ ...note, matched: hit.matched }] : [];
  });
  return (
    <section className={`frame ${w.section} ${s.intro}`} aria-labelledby="intro-title">
      <div className={s.problem}>
        <h2 id="intro-title" className={s.statement} data-w="reveal">{t.title}</h2>
        <div className={s.problemText}>
          {t.problem.map((p) => <p key={p}>{p}</p>)}
        </div>
      </div>

      <NumberTiles locale={locale} />

      <div className={s.what}>
        <div className={s.whatCopy}>
          <h3 className={s.h3}>{t.whatTitle}</h3>
          <p className={w.lede}>{t.whatLede}</p>
          <ul className={s.points}>
            {t.points.map((point) => (
              <li key={point.title}>
                <h4 className={s.pointTitle}>{point.title}</h4>
                <p>{point.body}</p>
              </li>
            ))}
          </ul>
          <UniverseGlance locale={locale} />
        </div>

        <aside className={`kit-card ${s.judge}`} data-tone="navy" aria-labelledby="judge-title">
          <header className={s.judgeHead}>
            <h3 id="judge-title" className={s.judgeTitle}>{t.judgeTitle}</h3>
            <SampleStamp text={t.judgeStamp} />
          </header>
          <p className={s.judgeName}>{fill(getWelcomeMessages(locale).build.specimen, { name: row.company.name, ticker: row.company.ticker })}</p>
          <ol className={s.judgeList}>
            {notes.map((note) => (
              <li key={note.id}>
                <Mark result={note.matched ? "pass" : "fail"} />
                <p><b>{m.rules[note.id]}</b><span data-result={note.matched ? "pass" : "fail"}>{note.matched ? t.holds : t.missed}</span>{note.text}</p>
              </li>
            ))}
          </ol>
          <p className={s.judgeFoot}>{t.judgeFoot}</p>
        </aside>
      </div>

    </section>
  );
}

/* ---------- 3. What you get, by area ---------- */

const AREA_CHIPS: { key: keyof ReturnType<typeof getWelcomeStoryMessages>["areas"]["items"]; chip: Chip; href?: string }[] = [
  { key: "stocks", chip: "free" },
  { key: "insiders", chip: "soon" },
  { key: "record", chip: "soon" },
  { key: "etfs", chip: "soon" },
  { key: "markets", chip: "soon" },
  { key: "method", chip: "open", href: "/methodology" },
];

function Areas({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).areas;
  return (
    <section className={`frame ${w.section}`} aria-labelledby="areas-title">
      <Head id="areas-title" title={t.title} lede={t.lede} />
      <div className={s.areasLayout}>
        <AppPreview locale={locale} />
        <ul className={s.areaList} data-w-group="">
          {AREA_CHIPS.map(({ key, chip, href }) => {
            const item = t.items[key];
            const plus = "plus" in item ? item.plus : null;
            const body = (
              <>
                <div className={s.areaTop}>
                  <h3 className={s.areaTitle}>{item.title}</h3>
                  <ChipTag chip={chip} label={t.chips[chip]} />
                </div>
                <p className={s.areaBody}>{item.body}</p>
                {plus ? <p className={s.areaPlus}><ChipTag chip="plus" label={t.chips.plus} /><span><span className="visually-hidden">{t.plusAdds}: </span>{plus}</span></p> : null}
              </>
            );
            return (
              <li key={key} className={`kit-card ${s.area}`} data-area={key}>
                {href ? <Link className={s.areaLink} href={`/${locale}${href}`}>{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      </div>
      <ScannerSample locale={locale} />
    </section>
  );
}

/* ---------- 5. On the record ---------- */

function OnRecord({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).open;
  return (
    <section className={`frame ${w.section}`} aria-labelledby="record-title">
      <Head id="record-title" title={t.title} lede={t.lede} />
      <RecordSample locale={locale} />
      <div className={s.record}>
        <ul className={s.ledger}>
          {t.items.map((item, i) => (
            <li key={item.title}>
              <div className={s.ledgerMain}>
                <h3 className={s.ledgerTitle}>{item.title}</h3>
                <p>{item.body}</p>
                {"link" in item && item.link ? <Link className="arrow-link" href={`/${locale}/methodology`}>{item.link}<G g="arrow" /></Link> : null}
              </div>
              <span className={s.status} data-live={i < 2 ? "" : undefined}>{item.status}</span>
            </li>
          ))}
        </ul>
        <div className={`kit-card ${s.sources}`}>
          <h3 className={s.h3} id="sources-title">{t.sourcesTitle}</h3>
          <table className={s.sourceTable} aria-labelledby="sources-title">
            <thead>
              <tr><th scope="col">{t.colSource}</th><th scope="col">{t.colUse}</th><th scope="col">{t.colStatus}</th></tr>
            </thead>
            <tbody>
              {t.sources.map((src) => (
                <tr key={src.name}>
                  <th scope="row">{src.name}</th>
                  <td>{src.use}</td>
                  <td><span className={s.sourceStatus} data-ok={src.ok ? "" : undefined}>{src.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Comparison locale={locale} />
    </section>
  );
}

/* ---------- 6. Plans ---------- */

/** Free and Plus cell text for one paid id, from the pricing copy and TIER_LIMITS (same rule as the pricing page). */
function cells(locale: Locale, id: TierId, pm: ReturnType<typeof getPricingMessages>) {
  const entry = id in TIERS ? TIERS[id as keyof typeof TIERS] : FEATURE_TIERS[id as keyof typeof FEATURE_TIERS];
  const row = pm.rows[id];
  if (entry.tier !== "paid" || entry.mode !== "limit" || !row?.free || !row.paid) return { free: null, paid: pm.included };
  const show = (template: string, n: number | null) => (n !== null ? fill(template, { n, days: plural(locale, pm.days, n) }) : template.includes("{") ? pm.unlimited : template);
  return { free: show(row.free, TIER_LIMITS.free[entry.limit]), paid: show(row.paid, TIER_LIMITS.paid[entry.limit]) };
}

function Plans({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).plans;
  const tiers = getWelcomeMessages(locale).tiers;
  const pm = getPricingMessages(locale);
  // Ideas rows stay off the public pitch: that output is held by ADVICE_OUTPUT for every tier.
  const ids = paidIds(Object.keys(pm.rows)).filter((id) => !id.startsWith("idea"));
  return (
    <section className={`frame ${w.section}`} aria-labelledby="plans-title" id="plans">
      <Head id="plans-title" title={t.title} lede={t.lede} aside={<Link className="arrow-link" href={`/${locale}/pricing`}>{t.compare}<G g="arrow" /></Link>} />
      <div className={s.plans}>
        <article className={`kit-card ${s.plan}`} aria-labelledby="plan-free">
          <h3 id="plan-free" className={s.planName}>{t.freeTitle}</h3>
          <p className={`${s.planPrice} num`}>{formatEur(locale, 0)}</p>
          <p className={s.planSub}>{t.freePrice}</p>
          <ul className={s.tick}>
            {tiers.free.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <AuthDialogLink locale={locale} next={`/${locale}`} className={`button secondary ${s.planAction}`}>{t.freeAction}</AuthDialogLink>
        </article>

        <article className={`kit-card ${s.plan} ${s.planPlus}`} aria-labelledby="plan-plus">
          <h3 id="plan-plus" className={s.planName}>{t.plusTitle}<span className={s.soonTag}>{t.plusSoon}</span></h3>
          <p className={s.planPrice}><span className="num">{fill(pm.plans.monthly, { price: formatEur(locale, PLUS_PRICE.monthlyEur) })}</span></p>
          <p className={s.planSub}>
            <span className="num">{fill(pm.plans.yearly, { price: formatEur(locale, PLUS_PRICE.yearlyEur) })}</span>
            <span className={s.dotSep} aria-hidden="true" />
            <span className="num">{fill(pm.plans.yearlyNote, { price: formatEur(locale, yearlyPerMonth()) })}</span>
          </p>
          <p className={s.planVat}>{pm.plans.vat} {t.plusPlanned}.</p>
          <ul className={s.tick} data-lock="">
            {tiers.plus.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className={s.planStatus}>{tiers.plusStatus}</p>
          <p className={s.trial}>{t.trial}</p>
        </article>

        <div className={`kit-card ${s.compare}`}>
          <table className={s.compareTable}>
            <caption className={s.compareCaption}>{t.tableTitle}</caption>
            <thead>
              <tr><th scope="col">{t.colFeature}</th><th scope="col">{t.freeTitle}</th><th scope="col">{t.plusTitle}</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t.always}</th>
                <td>{t.alwaysFree}</td>
                <td>{t.alwaysFree}</td>
              </tr>
              {ids.map((id) => {
                const c = cells(locale, id, pm);
                return (
                  <tr key={id}>
                    <th scope="row">{pm.rows[id]?.label}</th>
                    <td data-no={c.free ? undefined : ""}>{c.free ?? pm.notIncluded}</td>
                    <td>{c.paid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- 7. FAQ ---------- */

function StoryFaq({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).faq;
  return (
    <section className={`frame ${w.section} ${w.faqSection}`} aria-labelledby="faq-title">
      <Head id="faq-title" title={t.title} />
      <div className={w.faq}>
        {t.items.map((item) => (
          <details key={item.q} className={w.faqItem}>
            <summary><span>{item.q}</span><span className={w.faqIcon} aria-hidden="true" /></summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ---------- 8. Close ---------- */

function StoryClose({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).close;
  const hero = getWelcomeMessages(locale).hero;
  const m = getMessages(locale);
  return (
    <section className={`frame ${w.close}`} aria-labelledby="join-title" id="join">
      <div className={w.closePanel}>
        <div className={w.closeCopy}>
          <h2 id="join-title" className={w.closeTitle} data-w="reveal">{t.title}</h2>
          <p className={w.closeLede}>{t.body}</p>
          {/* A div, not a p: AuthDialogLink renders a <dialog> next to its link, and a dialog inside a p breaks hydration. */}
          <div className={s.closeSignIn}>
            {t.signInLead}{" "}
            <AuthDialogLink locale={locale} next={`/${locale}`} mode="sign-in" className={s.closeLink}>{t.signIn}</AuthDialogLink>
          </div>
          <Disclaimer text={m.common.disclaimer} compact />
        </div>
        <div className={`kit-card ${w.closeForm}`}>
          <SignedInSwap
            signedOut={<AuthForm locale={locale} next={`/${locale}`} headingLevel={2} hideHeading />}
            signedIn={<Link className={`button cta ${w.ctaBig}`} href={`/${locale}/dashboard`}>{hero.signedIn}<G g="arrow" /></Link>}
          />
        </div>
      </div>
    </section>
  );
}

/** Everything below the hero. Static copy and sample data only: no flag, store or request read, so the HTML is the same for every build and visitor. */
export function Story({ locale }: { locale: Locale }) {
  return (
    <>
      <RuleBand locale={locale} />
      <Intro locale={locale} />
      <ScoreStory locale={locale} />
      <div className={`frame ${s.after}`}><Checklist locale={locale} /></div>
      <Areas locale={locale} />
      <SecFacts locale={locale} />
      <OnRecord locale={locale} />
      <Plans locale={locale} />
      <StoryFaq locale={locale} />
      <StoryClose locale={locale} />
      <StickyCta locale={locale} label={getWelcomeMessages(locale).sticky} />
      <WelcomeMotion />
    </>
  );
}

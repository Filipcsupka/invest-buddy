import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable, ResultMark, SectionHead, TierBadge } from "@/components/kit";
import { TrackView } from "@/components/track-view";
import { WaitlistForm } from "@/components/waitlist-form";
import { flags } from "@/config/flags";
import { LIVE_PAID as LIVE, paidIds } from "@/components/landing/tier-rows";
import { FEATURE_TIERS, TIERS, TIER_LIMITS, type LimitKey, type TierId } from "@/config/tiers";
import { fill, getMessages, plural, type Locale } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { pageMetadata } from "@/i18n/metadata";
import { resolveSource } from "@/waitlist/source";
import { notFound } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./pricing.module.css";

type PricingProps = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getLaunchMessages(locale);
  return pageMetadata(locale, "/pricing", t.pricing.title, t.pricing.lede);
}

/** Free and paid cell text for one paid id, from the copy and TIER_LIMITS. A lock has no free text; a limit shows its numbers. */
function cells(locale: Locale, id: TierId, pm: ReturnType<typeof getPricingMessages>) {
  const entry = id in TIERS ? TIERS[id as keyof typeof TIERS] : FEATURE_TIERS[id as keyof typeof FEATURE_TIERS];
  const row = pm.rows[id];
  if (entry.tier !== "paid" || entry.mode !== "limit" || !row?.free || !row.paid) return { free: pm.notIncluded, paid: pm.included };
  const key: LimitKey = entry.limit;
  // A null limit means no cap: a template with a number gives way to "No limit", plain text such as "Full history" stays.
  const show = (template: string, n: number | null) => (n !== null ? fill(template, { n, days: plural(locale, pm.days, n) }) : template.includes("{") ? pm.unlimited : template);
  return { free: show(row.free, TIER_LIMITS.free[key]), paid: show(row.paid, TIER_LIMITS.paid[key]) };
}

async function Pricing({ params, searchParams }: PricingProps) {
  const locale = await resolveLocale(params);
  // The page exists only while the waitlist is open to the public. The proxy answers 404 first.
  if (!flags().WAITLIST) notFound();
  const m = getMessages(locale);
  const p = getLaunchMessages(locale).pricing;
  const pm = getPricingMessages(locale);
  const ids = paidIds(Object.keys(pm.rows));
  const source = resolveSource(await searchParams, "pricing");
  const k = getKitMessages(locale);
  return (
    <article className={`frame page ${styles.page}`}>
      <TrackView events={["pricing_view"]} props={{ locale }} />
      <header className={`page-head ${styles.head}`}>
        <h1 className="title">{p.title}</h1>
        <p className="lede">{p.lede}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>
      <section aria-label={pm.compareTitle} className={styles.plans}>
        <article className={`kit-card ${styles.plan}`} aria-labelledby="free">
          <header className={styles.planHead}>
            <h2 id="free">{pm.alwaysFreeTitle}</h2>
            <TierBadge tier="free" label={k.tier.free} />
          </header>
          <p className={styles.planLede}>{pm.alwaysFreeLede}</p>
          <ul className={styles.planList}>
            {pm.alwaysFree.map((item) => <li key={item}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span><span>{item}</span></li>)}
          </ul>
        </article>
        <article className={`kit-card ${styles.plan} ${styles.planPaid}`} aria-labelledby="paid">
          <header className={styles.planHead}>
            <h2 id="paid">{pm.paidTitle}</h2>
            <TierBadge tier="paid" label={k.tier.paid} />
          </header>
          <p className={styles.planLede}>{pm.paidLede}</p>
          <ul className={styles.planList}>
            {ids.slice(0, 6).map((id) => (
              <li key={id}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.itemMain}>
                  <span className={styles.itemName}>{pm.rows[id]?.label}</span>
                  <span className={styles.itemState} data-live={LIVE.has(id) ? "" : undefined}>{LIVE.has(id) ? pm.statusLive : pm.statusPlanned}</span>
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>
      <section aria-labelledby="compare" className={styles.compare}>
        <SectionHead id="compare" title={pm.compareTitle} lede={pm.compareLede} />
        <DataTable label={pm.tableCaption} bounded={false} stickyFirst>
          <thead>
            <tr>
              <th scope="col">{pm.colFeature}</th>
              <th scope="col">{pm.colFree}</th>
              <th scope="col">{pm.colPaid}</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const row = pm.rows[id]!;
              const c = cells(locale, id, pm);
              const live = LIVE.has(id);
              return (
                <tr key={id} data-tier-id={id}>
                  <th scope="row">
                    <span className={styles.label}>{row.label}</span>
                    <span className={styles.detail}>{row.detail}</span>
                    <span className={styles.status} data-live={live ? "" : undefined}>{live ? pm.statusLive : pm.statusPlanned}</span>
                  </th>
                  <td className={styles.free_cell}>{c.free}</td>
                  <td className={styles.paid_cell}>{c.paid}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </section>
      <section aria-labelledby="later" className={`kit-card ${styles.later}`}>
        <h2 id="later">{pm.noPriceTitle}</h2>
        <p>{pm.noPriceBody}</p>
        <p>{pm.adrNote}</p>
      </section>
      <section aria-labelledby="join" className={`kit-card ${styles.join}`}>
        <h2 id="join">{p.waitlistTitle}</h2>
        <div className={styles.joinForm}>
          <WaitlistForm locale={locale} labels={m.waitlist} source={source} hideTitle />
        </div>
      </section>
    </article>
  );
}

export default withPageLog("/pricing", Pricing);

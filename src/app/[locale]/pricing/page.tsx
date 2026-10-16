import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable, SectionHead, TierBadge } from "@/components/kit";
import { TrackView } from "@/components/track-view";
import { WaitlistForm } from "@/components/waitlist-form";
import { flags } from "@/config/flags";
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

/** Paid ids that already work in the beta. The rest are planned and say so. */
const LIVE: ReadonlySet<TierId> = new Set<TierId>(["score-history", "scanner-filters-advanced", "scanner-streak", "insiders-history"]);

/** Every id the tier config marks as paid, in the order the copy lists them. A paid id without a copy row is caught by the page test. */
function paidIds(order: string[]): TierId[] {
  const entries: [string, { tier: string }][] = [...Object.entries(TIERS), ...Object.entries(FEATURE_TIERS)];
  const paid = new Set(entries.filter(([, entry]) => entry.tier === "paid").map(([id]) => id));
  return order.filter((id) => paid.has(id)) as TierId[];
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
      <section aria-labelledby="free" className={styles.free}>
        <SectionHead id="free" title={pm.alwaysFreeTitle} lede={pm.alwaysFreeLede} meta={<TierBadge tier="free" label={k.tier.free} />} />
        <ul className={styles.freeList}>
          {pm.alwaysFree.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
      <section aria-labelledby="compare" className={styles.compare}>
        <SectionHead id="compare" title={pm.paidTitle} lede={`${pm.paidLede} ${pm.compareLede}`} meta={<TierBadge tier="paid" label={k.tier.paid} />} />
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
      <section aria-labelledby="later" className={styles.later}>
        <SectionHead id="later" title={pm.noPriceTitle} rule="quiet" />
        <div className={styles.laterGrid}>
          <p className="prose">{pm.noPriceBody}</p>
          <p className="prose">{pm.adrNote}</p>
        </div>
      </section>
      <section aria-labelledby="join" className={styles.join}>
        <SectionHead id="join" title={p.waitlistTitle} />
        <div className={styles.joinForm}>
          <WaitlistForm locale={locale} labels={m.waitlist} source={source} hideTitle />
        </div>
      </section>
    </article>
  );
}

export default withPageLog("/pricing", Pricing);

import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { TrackView } from "@/components/track-view";
import { WaitlistForm } from "@/components/waitlist-form";
import { FREE_LIMITS, PRICE_VARIANTS, resolveVariant, yearlyTotalEur } from "@/config/plans";
import { flags } from "@/config/flags";
import { fill, formatNumber, getMessages } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "@/components/launch.module.css";

type PricingProps = LocaleParams & { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getLaunchMessages(locale);
  return pageMetadata(locale, "/pricing", t.pricing.title, t.pricing.lede);
}

async function Pricing({ params, searchParams }: PricingProps) {
  const locale = await resolveLocale(params);
  // The page exists only while the waitlist is open to the public. The proxy answers 404 first.
  if (!flags().WAITLIST) notFound();
  const m = getMessages(locale);
  const t = getLaunchMessages(locale);
  const p = t.pricing;
  const variant = resolveVariant((await searchParams)?.v);
  const money = (value: number) => formatNumber(locale, value, 2);
  const rows: { key: keyof typeof p.rows; free: string | boolean; paid: string | boolean }[] = [
    { key: "score", free: true, paid: true },
    { key: "method", free: true, paid: true },
    { key: "portfolio", free: true, paid: true },
    { key: "weekly", free: true, paid: true },
    { key: "history", free: fill(p.historyFree, { n: FREE_LIMITS.scoreHistoryDays }), paid: p.historyPaid },
    { key: "scanner", free: fill(p.scannerFree, { n: FREE_LIMITS.scannerRows }), paid: p.scannerPaid },
    { key: "alerts", free: false, paid: true },
    { key: "csv", free: false, paid: true },
    { key: "discovery", free: false, paid: true },
  ];
  const cell = (value: string | boolean) => (typeof value === "string" ? value : value ? p.included : p.notIncluded);
  return (
    <article className="frame page">
      <TrackView events={["pricing_view", "variant"]} props={{ variant, locale }} />
      <header className="page-head">
        <h1 className="title">{p.title}</h1>
        <p className="lede">{p.lede}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>

      <section className={styles.plans} aria-label={p.tableCaption}>
        <div className={styles.plan}>
          <h2 className={styles.planName}>{p.freeName}</h2>
          <p className={styles.planPrice}>{p.freePrice}</p>
        </div>
        <div className={styles.plan} data-plan="paid" data-variant={variant}>
          <h2 className={styles.planName}>{p.paidName}</h2>
          <span className={styles.badge}>{p.paidTag}</span>
          <p className={styles.planPrice}>{fill(p.paidPrice, { price: money(PRICE_VARIANTS[variant].monthlyEur) })}</p>
          <p className={styles.planNote}>{fill(p.paidBilling, { total: money(yearlyTotalEur(variant)) })}</p>
        </div>
      </section>
      <p className="disclaimer">{p.plannedNote}</p>

      <section aria-labelledby="compare" className="ledger-quiet">
        <h2 id="compare">{p.featureCol}</h2>
        <div className={styles.compareWrap}>
          <table className={styles.compare}>
            <caption>{p.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{p.featureCol}</th>
                <th scope="col">{p.freeName}</th>
                <th scope="col">{p.paidName}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{p.rows[row.key]}</th>
                  <td>{cell(row.free)}</td>
                  <td>{cell(row.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="notes">
        <p className="prose" id="notes">{p.costNote}</p>
        <p className="prose">{p.renewalNote}</p>
      </section>

      <section aria-labelledby="join">
        <h2 id="join">{p.waitlistTitle}</h2>
        {/* While BILLING is off the paid button is the waitlist form. No checkout. */}
        <WaitlistForm copy={t.form} locale={locale} variant={variant} />
      </section>
    </article>
  );
}

export default withPageLog("/pricing", Pricing);

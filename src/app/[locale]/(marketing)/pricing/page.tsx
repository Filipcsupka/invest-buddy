import type { Metadata } from "next";
import { AuthDialogLink } from "@/components/auth/auth-dialog";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable, ResultMark, SectionHead } from "@/components/kit";
import { LIVE_PAID as LIVE, paidIds } from "@/components/landing/tier-rows";
import { PlusLock } from "@/components/paywall/lock-card";
import { TrackView } from "@/components/track-view";
import { WaitlistForm } from "@/components/waitlist-form";
import { historyDepth } from "@/components/welcome/sections";
import { FEATURE_TIERS, TIERS, TIER_LIMITS, type LimitKey, type TierId } from "@/config/tiers";
import { fill, getMessages, plural, type Locale } from "@/i18n";
import { getLaunchMessages } from "@/i18n/launch-messages";
import { pageMetadata } from "@/i18n/metadata";
import { getPricingMessages } from "@/i18n/pricing-messages";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { PASSIVE_PRICE, PLUS_PRICE, formatEur, yearlyPerMonth } from "@/app/[locale]/pricing/plans";
import { getPathMessages } from "@/i18n/path-messages";
import styles from "./pricing.module.css";

/* Same HTML for every visitor: no headers(), no cookies, no query read. Operate mode: plain and fast, no motion layer. */
export const revalidate = 3600;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const p = getPricingMessages(locale).plans;
  return pageMetadata(locale, "/pricing", p.title, p.lede);
}

/** Free and Plus cell text for one paid id, from the copy and TIER_LIMITS. A lock has no free text; a limit shows its numbers. */
function cells(locale: Locale, id: TierId, pm: ReturnType<typeof getPricingMessages>) {
  const entry = id in TIERS ? TIERS[id as keyof typeof TIERS] : FEATURE_TIERS[id as keyof typeof FEATURE_TIERS];
  const row = pm.rows[id];
  if (entry.tier !== "paid" || entry.mode !== "limit" || !row?.free || !row.paid) return { free: pm.notIncluded, paid: pm.included };
  const key: LimitKey = entry.limit;
  // A null limit means no cap: a template with a number gives way to "No limit", plain text such as "Full history" stays.
  const show = (template: string, n: number | null) => (n !== null ? fill(template, { n, days: plural(locale, pm.days, n) }) : template.includes("{") ? pm.unlimited : template);
  return { free: show(row.free, TIER_LIMITS.free[key]), paid: show(row.paid, TIER_LIMITS.paid[key]) };
}

export default async function Pricing({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  // A static page must not depend on flags read at build time, so the page is always open and Plus shows "opens soon". Opening
  // billing is a code change here (or a dynamic page), not a BILLING value baked into the HTML.
  const billing = false;
  const m = getMessages(locale);
  const pm = getPricingMessages(locale);
  const p = pm.plans;
  const l = pm.locks;
  const ids = paidIds(Object.keys(pm.rows));
  const lockAction = billing ? { href: "#plus", label: l.see } : { href: "#join", label: l.waitlist };
  const monthly = formatEur(locale, PLUS_PRICE.monthlyEur);
  const yearly = formatEur(locale, PLUS_PRICE.yearlyEur);
  const paths = getPathMessages(locale).paths;
  const a = pm.access;
  // Free, Passive, Plus per area. "licence" marks the market views a free account gets once a vendor display licence exists.
  const access: [keyof typeof a.rows, "yes" | "no" | "licence", "yes" | "no", "yes"][] = [
    ["method", "yes", "yes", "yes"],
    ["macro", "yes", "yes", "yes"],
    ["markets", "licence", "yes", "yes"],
    ["funds", "no", "yes", "yes"],
    ["stocks", "no", "no", "yes"],
  ];
  const cell = (value: "yes" | "no" | "licence") => value === "yes" ? pm.included : value === "no" ? pm.notIncluded : a.withLicence;
  return (
    <article className={`frame page ${styles.page}`}>
      <TrackView events={["pricing_view"]} props={{ locale }} />
      <header className={`page-head ${styles.head}`}>
        <h1 className="title">{p.title}</h1>
        <p className="lede">{p.lede}</p>
        <Disclaimer text={m.common.disclaimer} />
      </header>

      <section aria-label={p.title} className={styles.plans}>
        <article className={`kit-card ${styles.plan}`} aria-labelledby="free" data-plan="free">
          <p className={styles.path}>{paths.overview.name}</p>
          <header className={styles.planHead}>
            <h2 id="free">{p.freeName}</h2>
          </header>
          <p className={`${styles.price} num`}>{formatEur(locale, 0)}</p>
          <p className={styles.planLede}>{p.freeNote}</p>
          <ul className={styles.planList}>
            {paths.overview.items.map((item) => <li key={item}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span><span>{item}</span></li>)}
          </ul>
          <AuthDialogLink locale={locale} next={`/${locale}/pricing`} className={`button secondary ${styles.planAction}`}>{p.freeAction}</AuthDialogLink>
        </article>

        <article className={`kit-card ${styles.plan} ${styles.planPaid}`} aria-labelledby="passive-title" id="passive" data-plan="passive">
          <p className={styles.path}>{paths.passive.name}</p>
          <header className={styles.planHead}>
            <h2 id="passive-title">{p.passiveName}</h2>
            <span className={styles.soonTag}>{billing ? p.planned : p.soonTitle}</span>
          </header>
          <div className={styles.prices}>
            <p className={styles.priceRow}>
              <span className={`${styles.price} num`}>{formatEur(locale, PASSIVE_PRICE.monthlyEur)}</span>
              <span className={styles.per}>{fill(p.monthly, { price: "" }).trim()}</span>
            </p>
            <p className={styles.priceRow}>
              <span className={`${styles.price} num`}>{formatEur(locale, PASSIVE_PRICE.yearlyEur)}</span>
              <span className={styles.per}>{fill(p.yearly, { price: "" }).trim()}</span>
              <span className={styles.yearNote}>{fill(p.yearlyNote, { price: formatEur(locale, yearlyPerMonth(PASSIVE_PRICE)) })}</span>
            </p>
          </div>
          <p className={styles.vat}>{p.vat} {billing ? null : <span>{p.planned}.</span>}</p>
          <p className={styles.planLede}>{paths.passive.body}</p>
          <ul className={styles.planList}>
            {paths.passive.items.map((item) => <li key={item}><span className="kit-mark" data-result="pass"><ResultMark result="pass" /></span><span>{item}</span></li>)}
          </ul>
          <div className={styles.soon} role="note">
            <p>{p.passiveSoonBody}</p>
            <a className={`button secondary ${styles.planAction}`} href="#join">{p.notifyPassive}</a>
          </div>
          <p className={styles.refund}>{p.refund}</p>
        </article>

        <article className={`kit-card ${styles.plan} ${styles.planPaid}`} aria-labelledby="plus-title" id="plus" data-plan="plus">
          <p className={styles.path}>{paths.active.name}</p>
          <header className={styles.planHead}>
            <h2 id="plus-title">{p.plusName}</h2>
            <span className={styles.soonTag}>{billing ? p.planned : p.soonTitle}</span>
          </header>
          <div className={styles.prices}>
            <p className={styles.priceRow}>
              <span className={`${styles.price} num`}>{monthly}</span>
              <span className={styles.per}>{fill(p.monthly, { price: "" }).trim()}</span>
            </p>
            <p className={styles.priceRow}>
              <span className={`${styles.price} num`}>{yearly}</span>
              <span className={styles.per}>{fill(p.yearly, { price: "" }).trim()}</span>
              <span className={styles.yearNote}>{fill(p.yearlyNote, { price: formatEur(locale, yearlyPerMonth()) })}</span>
            </p>
          </div>
          <p className={styles.vat}>{p.vat} {billing ? null : <span>{p.planned}.</span>}</p>
          <p className={styles.planLede}>{paths.active.body} {pm.paidLede}</p>
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
          {billing ? (
            <AuthDialogLink locale={locale} next={`/${locale}/pricing#plus`} className={`button cta ${styles.planAction}`}>{p.choose}</AuthDialogLink>
          ) : (
            <div className={styles.soon} role="note">
              <p>{p.soonBody}</p>
              <a className={`button ${styles.planAction}`} href="#join">{p.notify}</a>
            </div>
          )}
          <p className={styles.refund}>{p.refund}</p>
        </article>
      </section>

      <section aria-labelledby="access" className={styles.compare}>
        <SectionHead id="access" title={a.title} lede={a.lede} />
        <DataTable label={a.caption} bounded={false} stickyFirst>
          <thead>
            <tr>
              <th scope="col">{a.colArea}</th>
              <th scope="col">{pm.colFree}</th>
              <th scope="col">{pm.colPassive}</th>
              <th scope="col">{pm.colPaid}</th>
            </tr>
          </thead>
          <tbody>
            {access.map(([key, free, passive, plus]) => (
              <tr key={key} data-area={key}>
                <th scope="row"><span className={styles.label}>{a.rows[key]}</span></th>
                <td className={styles.free_cell} data-access={free}>{cell(free)}</td>
                <td className={styles.free_cell} data-access={passive}>{cell(passive)}</td>
                <td className={styles.paid_cell} data-access={plus}>{cell(plus)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section aria-labelledby="locks" className={styles.locks}>
        <SectionHead id="locks" title={l.title} lede={l.lede} />
        <div className={styles.lockGrid}>
          <PlusLock
            form="control"
            badge={l.badge}
            title={l.filtersTitle}
            note={l.filtersNote}
            action={lockAction}
            control={
              <label className={styles.fakeControl}>
                <span>{l.filtersControl}</span>
                <select disabled tabIndex={-1} aria-hidden="true" defaultValue="any"><option value="any">{l.partOf}</option></select>
              </label>
            }
          />
          <PlusLock form="depth" badge={l.badge} title={l.historyTitle} note={l.historyNote} summary={historyDepth(locale)} action={lockAction}>
            <p className={styles.lockHead}><span className={styles.lockTitle}>{l.historyTitle}</span><span className="stamp">{l.sample}</span></p>
            <svg className={styles.spark} viewBox="0 0 200 48" aria-hidden="true" focusable="false" preserveAspectRatio="none">
              <path d="M0 34 L20 30 L40 32 L60 24 L80 26 L100 18 L120 22 L140 14 L160 16 L180 10 L200 12" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
          </PlusLock>
          <PlusLock form="teaser" badge={l.badge} title={l.teaserTitle} note={l.teaserNote} sampleLabel={l.sample} action={lockAction}>
            <dl className={styles.teaserRow}>
              <dt>{getWelcomeMessages(locale).areas.items.stocks.title}</dt>
              <dd className="num">HBLS</dd>
              <dt>{l.teaserCol}</dt>
              <dd className="num">12</dd>
            </dl>
          </PlusLock>
          <PlusLock form="card" badge={l.badge} title={l.cardTitle} note={l.cardBody} action={lockAction} />
        </div>
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

      <section aria-labelledby="join-title" className={`kit-card ${styles.join}`} id="join">
        <h2 id="join-title">{getLaunchMessages(locale).pricing.waitlistTitle}</h2>
        <div className={styles.joinForm}>
          <WaitlistForm locale={locale} labels={m.waitlist} source="pricing" hideTitle />
        </div>
      </section>
    </article>
  );
}

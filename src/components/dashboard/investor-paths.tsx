import Link from "next/link";
import { IconArrowRight } from "@/components/icons";
import { AreaChip, IconLock } from "@/components/kit";
import { PATH_AREA, PATH_HREF, type PathCard } from "@/config/investor-paths";
import { fill, type Locale } from "@/i18n";
import { getPathMessages } from "@/i18n/path-messages";
import { PLAN_PRICES, formatEur } from "@/app/[locale]/pricing/plans";
import styles from "./investor-paths.module.css";

/**
 * "Choose your path": Active, Passive and Market overview, each with its plan and price. Server-rendered; the cards come from
 * pathCards, so access is whatever the server gates decided. A locked card names its plan with a lock and leads to that plan on the
 * pricing page. No modal, no countdown, no urgency (funnel-design s3, ADR-001).
 */
export function InvestorPaths({ locale, cards, signedIn, licensed }: { locale: Locale; cards: PathCard[]; signedIn: boolean; licensed: boolean }) {
  const t = getPathMessages(locale);
  return (
    <section className={styles.paths} aria-labelledby="paths-title" data-investor-paths="">
      <header className={styles.head}>
        <h2 id="paths-title" className={styles.title}>{t.title}</h2>
        <p className={styles.lede}>{t.lede}</p>
      </header>
      <ul className={styles.grid}>
        {cards.map((card) => {
          const copy = t.paths[card.id];
          const overviewText = card.id === "overview" && licensed ? t.overviewLicensed : null;
          const price = card.id === "overview" ? null : PLAN_PRICES[card.id];
          const action = card.state === "locked" ? t.seePlan
            : card.id === "overview" && card.href === PATH_HREF.overview ? t.overviewLicensed.action
            : copy.action;
          const titleId = `path-${card.id}-title`;
          return (
            <li key={card.id} className={styles.item}>
              <article className={`kit-card ${styles.card}`} data-path={card.id} data-area={PATH_AREA[card.id]} data-state={card.state} aria-labelledby={titleId}>
                <p className={styles.top}>
                  <AreaChip locale={locale} area={PATH_AREA[card.id]} />
                  <span className={styles.plan} data-locked={card.state === "locked" ? "" : undefined}>
                    {card.state === "locked" && <IconLock />}
                    <span>{copy.plan}</span>
                  </span>
                  {card.state === "current" && <span className={styles.yours}>{t.yourPlan}</span>}
                  {card.state === "open" && signedIn && card.included && card.id !== "overview" && <span className={styles.note}>{t.included}</span>}
                  {card.state === "locked" && signedIn && <span className={styles.note}>{t.lockedNote}</span>}
                </p>
                <h3 id={titleId} className={styles.name}>{copy.name}</h3>
                <p className={styles.price}>
                  <span className="num">{price ? fill(t.perMonth, { price: formatEur(locale, price.monthlyEur) }) : t.free}</span>
                  {price && <span className={`${styles.year} num`}>{fill(t.perYear, { price: formatEur(locale, price.yearlyEur) })}</span>}
                </p>
                <p className={styles.body}>{overviewText?.body ?? copy.body}</p>
                <ul className={styles.items}>
                  {(overviewText?.items ?? copy.items).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Link className={card.state === "locked" ? `arrow-link ${styles.action}` : `button${card.state === "current" ? "" : " secondary"} ${styles.action}`} href={`/${locale}${card.href}`} prefetch={false}>
                  {action}
                  {card.state === "locked" && <IconArrowRight />}
                </Link>
              </article>
            </li>
          );
        })}
      </ul>
      <p className={styles.vat}>{t.vat}</p>
    </section>
  );
}

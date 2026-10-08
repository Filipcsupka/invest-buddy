import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { ACCOUNT_BUCKETS, sizingCap, sizingPercent } from "@/engine/sizing";
import type { SizeTier } from "@/engine/signals";
import { formatNumber, getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./sizing.module.css";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/sizing", m.meta.sizingTitle, m.meta.sizingDescription);
}

async function Sizing({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale).sizing;
  const accounts = [m.under5, m.five25, m.twentyfive100, m.over100];
  const tiers: { key: SizeTier; label: string; add?: boolean }[] = [
    { key: "STARTER", label: m.starter },
    { key: "STANDARD", label: m.standard },
    { key: "FULL", label: m.full },
    { key: "ADD_THIRD", label: m.addThird, add: true },
    { key: "ADD_HALF", label: m.addHalf, add: true },
  ];
  const percent = (value: number) => `${formatNumber(locale, value, Number.isInteger(value) ? 0 : 1)} %`;

  return (
    <article className="frame page reading">
      <header className="page-head">
        <h1 className="title">{m.title}</h1>
        <p className="lede">{m.lede}</p>
        <Disclaimer text={m.disclaimer} />
      </header>

      <section aria-labelledby="sizing-matrix">
        <h2 id="sizing-matrix">{m.matrixTitle}</h2>
        <p className="prose">{m.matrixNote}</p>
        <p className="muted small">{m.draft}</p>
        <div className={styles.scroll}>
          <table className={styles.matrix}>
            <thead><tr><th scope="col">{m.account}</th>{accounts.map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {tiers.map(({ key, label, add }) => (
                <tr key={key} className={add ? styles.add : undefined}>
                  <th scope="row">{label}</th>
                  {ACCOUNT_BUCKETS.map((account) => <td key={account}>{add ? "+" : ""}{percent(sizingPercent(key, account, "10_TO_30"))}</td>)}
                </tr>
              ))}
              <tr className={styles.cap}><th scope="row">{m.cap}</th>{ACCOUNT_BUCKETS.map((account) => <td key={account}>{percent(sizingCap(account))}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="sizing-cash">
        <h2 id="sizing-cash">{m.cashTitle}</h2>
        <ul className={styles.rules}><li>{m.cashLow}</li><li>{m.cashMiddle}</li><li>{m.cashHigh}</li></ul>
      </section>

      <section aria-labelledby="sizing-add">
        <h2 id="sizing-add">{m.addTitle}</h2>
        <p className="prose">{m.addRule}</p>
        <p className="prose">{m.reduceRule}</p>
      </section>

      <section aria-labelledby="sizing-example">
        <h2 id="sizing-example">{m.exampleTitle}</h2>
        <p className="prose">{m.example}</p>
        <p className="muted small">{m.privacy}</p>
      </section>
    </article>
  );
}

export default withPageLog("/sizing", Sizing);

export const dynamic = "force-dynamic";

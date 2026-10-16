import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable, SectionHead } from "@/components/kit";
import "@/components/record-pages.css";
import { PaywallSegment } from "@/components/paywall-segment";
import { ACCOUNT_BUCKETS, sizingCap, sizingPercent } from "@/engine/sizing";
import type { SizeTier } from "@/engine/signals";
import { formatNumber, getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

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
    <article className="frame page rp-article">
      <header className="page-head">
        <h1 className="title">{m.title}</h1>
        <p className="lede">{m.lede}</p>
        <Disclaimer text={m.disclaimer} />
      </header>

      <PaywallSegment id="sizing-matrix"><section aria-labelledby="sizing-matrix">
        <SectionHead id="sizing-matrix" title={m.matrixTitle} />
        <p className="prose">{m.matrixNote}</p>
        <p className="muted small">{m.draft}</p>
        <DataTable label={m.matrixTitle} bounded={false} density="compact" stickyFirst>
            <thead><tr><th scope="col">{m.account}</th>{accounts.map((label) => <th scope="col" className="num" key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {tiers.map(({ key, label, add }) => (
                <tr key={key} data-add={add ? "true" : undefined}>
                  <th scope="row">{label}</th>
                  {ACCOUNT_BUCKETS.map((account) => <td className="num" key={account}>{add ? "+" : ""}{percent(sizingPercent(key, account, "10_TO_30"))}</td>)}
                </tr>
              ))}
              <tr className="rp-cap"><th scope="row">{m.cap}</th>{ACCOUNT_BUCKETS.map((account) => <td className="num" key={account}>{percent(sizingCap(account))}</td>)}</tr>
            </tbody>
          </DataTable>
      </section></PaywallSegment>

      <PaywallSegment id="sizing-cash"><section aria-labelledby="sizing-cash">
        <SectionHead id="sizing-cash" title={m.cashTitle} />
        <ul className="rp-list"><li>{m.cashLow}</li><li>{m.cashMiddle}</li><li>{m.cashHigh}</li></ul>
      </section></PaywallSegment>

      <PaywallSegment id="sizing-add"><section aria-labelledby="sizing-add">
        <SectionHead id="sizing-add" title={m.addTitle} />
        <p className="prose">{m.addRule}</p>
        <p className="prose">{m.reduceRule}</p>
      </section></PaywallSegment>

      <PaywallSegment id="sizing-example"><section aria-labelledby="sizing-example">
        <SectionHead id="sizing-example" title={m.exampleTitle} />
        <p className="prose">{m.example}</p>
        <p className="muted small">{m.privacy}</p>
      </section></PaywallSegment>
    </article>
  );
}

export default withPageLog("/sizing", Sizing);

export const dynamic = "force-dynamic";

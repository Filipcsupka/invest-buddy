import type { Metadata } from "next";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { ScannerTable } from "@/components/scanner-table";
import { byScore, toRow } from "@/components/view-model";
import { scoredUniverse } from "@/data/scored";
import { fill, getMessages, plural } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/scanner", m.meta.scannerTitle, m.meta.scannerDescription);
}

export default async function Scanner({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const rows = (await scoredUniverse()).map((row) => toRow(locale, row)).sort(byScore);
  return (
    <div className="frame page">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.scanner.title}</h1>
          <SampleStamp text={m.common.sample} />
        </div>
        <p className="lede">{fill(m.scanner.lede, { count: plural(locale, m.plurals.sampleTickers, rows.length) })}</p>
        <OperatorDisclosure text={m.common.operatorDisclosure} />
      </header>
      <ScannerTable
        locale={locale}
        rows={rows}
        text={{
          searchLabel: m.scanner.searchLabel,
          searchPlaceholder: m.scanner.searchPlaceholder,
          filterLabel: m.scanner.filterLabel,
          allStates: m.scanner.allStates,
          clear: m.scanner.clear,
          empty: m.scanner.empty,
          showing: m.scanner.showing,
          sortBy: m.table.sortBy,
          disclaimer: m.common.disclaimer,
          extension: m.common.extension,
          noScore: m.common.noScore,
          columns: {
            ticker: m.table.ticker,
            sector: m.table.sector,
            score: m.table.score,
            rules: m.table.rules,
            state: m.table.state,
            f: m.groups.fundamentalsShort,
            t: m.groups.technicalShort,
            m: m.groups.macroShort,
            fName: m.groups.fundamentals,
            tName: m.groups.technical,
            mName: m.groups.macro,
          },
          states: m.states,
        }}
      />
    </div>
  );
}

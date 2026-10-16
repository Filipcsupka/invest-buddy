import Link from "next/link";
import type { Metadata } from "next";
import { withPageLog } from "@/app/page-log";
import { flags } from "@/config/flags";
import { SampleStamp, OperatorDisclosure } from "@/components/operator-disclosure";
import { PaywallSegment } from "@/components/paywall-segment";
import { TierBadge } from "@/components/tier-lock";
import { getViewer } from "@/viewer/get-viewer";
import type { Viewer } from "@/viewer/viewer";
import { getTierMessages } from "@/i18n/tier-messages";
import { getTierListsMessages } from "@/i18n/tier-lists-messages";
import { StatusCell, statusLabel } from "@/components/status-slider";
import { toRow, byScore } from "@/components/view-model";
import { DataStatus } from "@/components/data-status";
import { latestPortfolio, latestScores } from "@/data/store";
import { ruleStreaks, type RuleStreak } from "@/db/rules-streak";
import { fill, getMessages, intlTag, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { ruleGroups, stateOrder } from "@/i18n/rules";
import { sectorLabel } from "@/i18n/score-text";
import { resolveLocale, type LocaleParams } from "../locale";
import { getScannerFloorMessages, hiddenText } from "@/i18n/scanner-floor-messages";
import { latestShareCounts } from "@/data/flag-facts";
import { filterScores, filtersHref, parseFilters, type Query, type ScannerFilters } from "./filters";
import { floorMetrics, floorState, SCANNER_FLOOR } from "./floor";
import { ruleCountLabel, streakText } from "./format";
import { matchesPreset, presets } from "./presets";
import { isChangePreset, limitFiltersFor } from "./access";
import styles from "./scanner.module.css";

export const dynamic = "force-dynamic";
type Props = LocaleParams & { searchParams: Promise<Query> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const metadata = pageMetadata(locale, "/scanner", m.meta.scannerTitle, m.meta.scannerDescription);
  const query = await searchParams;
  if (Object.keys(query).length) metadata.robots = { index: false, follow: true };
  return metadata;
}

const copy = {
  en: { sector: "Sector", score: "Total score", sort: "Sort by", minimum: "From", maximum: "To", all: "Any", f: "Min F", t: "Min T", m: "Min M", held: "Held only", source: "Source", guide: "Guide", discovery: "Discovery", extension: "Extension", apply: "Apply filters", clear: "Clear filters", result: "{count} of {total} tickers", empty: "No tickers match these filters.", sourceNote: "Discovery candidates appear after they have a stored score." },
  sk: { sector: "Sektor", score: "Celkové skóre", sort: "Zoradiť podľa", minimum: "Od", maximum: "Do", all: "Všetky", f: "Min F", t: "Min T", m: "Min M", held: "Len držané", source: "Zdroj", guide: "Príručka", discovery: "Objavené", extension: "Rozšírenie", apply: "Použiť filtre", clear: "Zrušiť filtre", result: "{count} z {total} tickerov", empty: "Žiadny ticker nezodpovedá filtrom.", sourceNote: "Objavené spoločnosti sa zobrazia po uložení skóre." },
} as const;

function FilterForm({ locale, filters, sectors, viewer }: { locale: Locale; filters: ScannerFilters; sectors: string[]; viewer: Viewer }) {
  const m = getMessages(locale);
  const c = copy[locale];
  const options = (max: number) => Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>);
  return <form action={`/${locale}/scanner`} method="get" className={styles.filters} aria-label={m.scanner.filterLabel}>
    {filters.preset && <input type="hidden" name="preset" value={filters.preset} />}
    {!filters.floor && <input type="hidden" name="floor" value="off" />}
    <label>{m.scanner.searchLabel}<input type="search" name="q" defaultValue={filters.q} placeholder={m.scanner.searchPlaceholder} maxLength={80} /></label>
    <label>{m.scanner.filterLabel}<select name="state" defaultValue={filters.state}><option value="">{m.scanner.allStates}</option>{stateOrder.map((state) => <option key={state} value={state}>{statusLabel(m, state, flags().ADVICE_OUTPUT)}</option>)}</select></label>
    <label>{c.sector}<select name="sector" defaultValue={filters.sector}><option value="">{c.all}</option>{sectors.map((sector) => <option key={sector} value={sector}>{sectorLabel(locale, sector)}</option>)}</select></label>
    <PaywallSegment id="scanner-filters-advanced" viewer={viewer} locale={locale}><div className={styles.advanced}>
    <label>{c.source}<select name="source" defaultValue={filters.source}><option value="">{c.all}</option><option value="guide">{c.guide}</option><option value="discovery">{c.discovery}</option><option value="sample extension">{c.extension}</option></select></label>
    <fieldset className={styles.range}><legend>{c.score}</legend><label>{c.minimum}<select name="min" defaultValue={filters.min ?? ""}><option value="">{c.all}</option>{options(25)}</select></label><label>{c.maximum}<select name="max" defaultValue={filters.max ?? ""}><option value="">{c.all}</option>{options(25)}</select></label></fieldset>
    {([["f", c.f, 10], ["t", c.t, 10], ["m", c.m, 5]] as const).map(([key, label, max]) => <label key={key}>{label}<select name={key} defaultValue={filters[key] ?? ""}><option value="">{c.all}</option>{options(max)}</select></label>)}
    <label>{c.sort}<select name="sort" defaultValue={filters.sort}><option value="score">{m.table.score}</option><option value="ticker">{m.table.ticker}</option><option value="sector">{m.table.sector}</option><option value="f">{m.groups.fundamentals}</option><option value="t">{m.groups.technical}</option><option value="m">{m.groups.macro}</option><option value="state">{m.table.state}</option></select></label>
    <label className={styles.check}><input type="checkbox" name="held" value="yes" defaultChecked={filters.held} />{c.held}</label>
    </div></PaywallSegment>
    <div className={styles.actions}><button className="button" type="submit">{c.apply}</button><Link className="button secondary" href={`/${locale}/scanner`}>{c.clear}</Link></div>
  </form>;
}

const ruleTotal = ruleGroups.reduce((sum, group) => sum + group.rules.length, 0);

function PresetBar({ locale, filters, counts, total, viewer }: { locale: Locale; filters: ScannerFilters; counts: Record<string, number>; total: number; viewer: Viewer }) {
  const m = getMessages(locale);
  const s = m.scanner;
  const href = (id: string) => `/${locale}/scanner${id ? `?preset=${id}` : ""}`;
  return <nav className={styles.presets} aria-label={s.presetsLabel}>
    <h2 className={styles.presetsTitle}>{s.presetsLabel}</h2>
    <p className="muted small">{s.presetsNote}</p>
    <ul className={styles.presetList}>{presets.map((preset) => {
      const text = s.presets[preset.id];
      if (isChangePreset(preset.id) && viewer.tier === "free") {
        const lock = getTierListsMessages(locale).changePresetLock;
        return <li key={preset.id}><span className={styles.preset} aria-disabled="true"><span className={styles.presetName}>{text.name}</span><span className={styles.presetMeta}>{lock}</span></span></li>;
      }
      const rules = preset.kind === "rules" ? ruleCountLabel(locale, preset.rules.length) : fill(s.presetAny, { count: preset.rules.length });
      return <li key={preset.id}><Link className={styles.preset} href={href(preset.id)} aria-current={filters.preset === preset.id ? "true" : undefined} title={text.note}>
        <span className={styles.presetName}>{text.name}{isChangePreset(preset.id) && viewer.tier === "admin" ? <TierBadge segmentId="scanner-streak" label={getTierMessages(locale).badge} title={getTierMessages(locale).badgeHint} /> : null}</span><span className={styles.presetMeta}>{fill(s.presetMeta, { rules, count: counts[preset.id] ?? 0, total })}</span></Link></li>;
    })}</ul>
    {filters.preset && <p className="small">{fill(s.presetActive, { name: s.presets[filters.preset].name })} <Link href={`/${locale}/scanner`}>{s.presetClear}</Link></p>}
  </nav>;
}

function rulesMetCell(locale: Locale, matched: string[] | null, streak: RuleStreak | undefined) {
  const s = getMessages(locale).scanner;
  if (!matched) return "–";
  return <><span>{fill(s.rulesMetOf, { met: matched.length, total: ruleTotal })}</span>
    {streak && <span className={styles.streak}>{streakText(locale, streak)}</span>}
    {streak?.gained.length ? <span className={styles.streak}>{fill(s.streakGained, { count: streak.gained.length })}</span> : null}
    {streak?.lost.length ? <span className={styles.streak}>{fill(s.streakLost, { count: streak.lost.length })}</span> : null}</>;
}

async function Scanner({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const viewer = await getViewer();
  const m = getMessages(locale);
  const c = copy[locale];
  const filters = limitFiltersFor(viewer, parseFilters(await searchParams));
  const [data, portfolio, streakData] = await Promise.all([latestScores(), latestPortfolio(), ruleStreaks()]);
  // A free viewer gets no streak data, neither in the column nor in the change presets.
  const streaks = viewer.tier === "free" ? {} : streakData;
  const held = new Set(portfolio?.weights.filter((row) => row.weightPercent > 0).map((row) => row.symbol.toUpperCase()) ?? []);
  const sectors = [...new Set(data.rows.map((row) => row.instrument.sector))].sort((a, b) => a.localeCompare(b, locale));
  const shares = await latestShareCounts(data.rows.map((row) => row.instrument.ticker));
  const floorData = Object.fromEntries(data.rows.map((row) => [row.instrument.ticker, floorMetrics(row.result.inputs?.bars ?? [], shares[row.instrument.ticker])]));
  const fl = getScannerFloorMessages(locale);
  const million = (usd: number) => fl.millions.replace("{n}", new Intl.NumberFormat(intlTag[locale]).format(usd / 1_000_000));
  const unfloored = filterScores(data.rows, { ...filters, floor: false }, held, locale, streaks, floorData);
  const visible = filterScores(data.rows, filters, held, locale, streaks, floorData).map((row) => toRow(locale, row)).sort((a, b) => {
    if (filters.sort === "score") return byScore(a, b);
    const field = { f: "fundamentals", t: "technical", m: "macro", ticker: "ticker", sector: "sector", state: "state" } as const;
    const key = field[filters.sort];
    const first = a[key], second = b[key];
    return (typeof first === "number" && typeof second === "number" ? second - first : String(first).localeCompare(String(second), locale)) || a.ticker.localeCompare(b.ticker);
  });
  const presetCounts = Object.fromEntries(presets.map((preset) => [preset.id, data.rows.filter(({ result }) => matchesPreset(preset, result.ruleHits, streaks[result.ticker])).length]));
  const s = m.scanner;
  return <div className="frame page">
    <header className="page-head"><div className="page-title-row"><h1 className="title">{m.scanner.title}</h1>{data.sample && <SampleStamp text={m.common.sample} />}</div>
      <p className="lede">{m.meta.scannerDescription}</p><DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} /><OperatorDisclosure text={m.common.operatorDisclosure} />
    </header>
    <PresetBar locale={locale} filters={filters} counts={presetCounts} total={data.rows.length} viewer={viewer} />
    <FilterForm locale={locale} filters={filters} sectors={sectors} viewer={viewer} />
    <p className={styles.summary} aria-live="polite">{fill(filters.floor ? fl.result : fl.resultOff, { count: visible.length, total: data.rows.length })}{" "}
      <Link className="small" href={filtersHref(locale, filters, !filters.floor)}>{filters.floor ? fl.remove : fl.apply}</Link></p>
    <p className="muted small">{fill(filters.floor ? fl.rule : fl.ruleOff, { volume: million(SCANNER_FLOOR.minAvgDollarVolumeUsd), days: SCANNER_FLOOR.days, cap: million(SCANNER_FLOOR.minMarketCapUsd) })}{filters.floor ? ` ${hiddenText(locale, unfloored.length - visible.length)}` : ""}</p>
    <p className="muted small">{c.sourceNote}</p>
    <PaywallSegment id="scanner-streak" viewer={viewer} locale={locale}><p className="muted small">{getTierListsMessages(locale).streakNote}</p></PaywallSegment>
    <PaywallSegment id="scanner-rows-full" viewer={viewer} locale={locale}><section aria-label={m.scanner.title}>
      {visible.length ? <div className="table-scroll" role="region" tabIndex={0} aria-label={m.scanner.title}><table className="screen"><caption className="visually-hidden">{m.scanner.title}</caption><thead><tr><th scope="col">{m.table.ticker}</th><th scope="col" className="col-sector">{m.table.sector}</th><th scope="col">{m.table.score}</th><th scope="col">{s.rulesMet}</th><th scope="col">{m.status.columns.status}</th></tr></thead><tbody>{visible.map((row) => <tr key={row.ticker}><th scope="row" className="col-company"><Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link><span className="company-name">{row.name}{held.has(row.ticker) ? <span className="tag">{m.portfolio.held}</span> : null}{floorState(floorData[row.ticker]) === "unknown" ? <span className="tag" title={fl.noDataNote}>{fl.noData}</span> : null}</span></th><td className="col-sector muted">{row.sector}</td><td className="num" aria-describedby="scanner-disclaimer">{row.percent === null ? m.common.noScore : `${row.percentLabel} · ${row.bonusLabel} · ${fill(m.status.coreData, { known: row.pointsKnown, total: row.coreTotal })}`}</td><td className="num">{rulesMetCell(locale, row.matched, streaks[row.ticker])}</td><td><StatusCell state={row.state} position={row.position} label={row.stateLabel} ariaLabel={row.statusAria} pullbackLabel={row.pullbackLabel} describedBy="scanner-disclaimer" /></td></tr>)}</tbody></table></div> : <p className="empty-line">{c.empty}</p>}
    </section></PaywallSegment>
    <p className="disclaimer is-compact" id="scanner-disclaimer">{m.common.disclaimer}</p>
  </div>;
}

export default withPageLog("/scanner", Scanner);

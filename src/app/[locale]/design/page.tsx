import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import { IconSearch } from "@/components/icons";
import { CountUp, DataTable, DataTableEmpty, LockCard, Reveal, RuleRow, RuleTable, ScoreBar, ScoreDial, SectionHead, StateChip, StateStrip, TierBadge, TierBanner, TierFrame, kitStates, type KitState, type StateChange } from "@/components/kit";
import { designViewEnabled } from "@/config/flags";
import { fill, formatDate, formatNumber, formatPercent, formatScorePercent, getMessages, type Locale, type Messages } from "@/i18n";
import { getKitMessages } from "@/i18n/kit-messages";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./design.module.css";

// The guard reads the runtime environment, so the page is never prerendered at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return { title: getKitMessages(locale).design.metaTitle, robots: { index: false, follow: false } };
}

const label = (m: Messages, state: KitState) => (state === "pullback" ? m.states.pullback : m.status.labels[state]);

type Swatch = { name: string; bg: string; fg: string; border?: string };
const neutrals: Swatch[] = [
  { name: "ground / ink", bg: "ground", fg: "ink" },
  { name: "sheet / ink-2", bg: "sheet", fg: "ink-2" },
  { name: "sheet-raised / ink-3", bg: "sheet-raised", fg: "ink-3" },
  { name: "sheet-hover / ink", bg: "sheet-hover", fg: "ink" },
  { name: "ink / ground", bg: "ink", fg: "ground" },
  { name: "rule-strong", bg: "ground", fg: "ink-2", border: "rule-strong" },
];
const signal: Swatch[] = [
  { name: "signal / on-signal", bg: "signal", fg: "on-signal" },
  { name: "signal-strong", bg: "sheet", fg: "signal-strong" },
  { name: "signal-wash / signal", bg: "signal-wash", fg: "signal" },
  { name: "signal-tint / signal", bg: "signal-tint", fg: "signal" },
];
const bands = ["setup", "watch", "wait", "ignore", "broken", "none"] as const;
const tier: Swatch[] = [
  { name: "tier / tier-on", bg: "tier", fg: "tier-on" },
  { name: "tier-wash / tier", bg: "tier-wash", fg: "tier" },
  { name: "tier-line", bg: "ground", fg: "tier", border: "tier-line" },
];

function Swatches({ items }: { items: Swatch[] }) {
  return (
    <ul className={styles.swatches}>
      {items.map((s) => (
        <li key={s.name} className={styles.swatch}>
          <span className={styles.chipSwatch} style={{ background: `var(--${s.bg})`, color: `var(--${s.fg})`, borderColor: s.border ? `var(--${s.border})` : undefined } as CSSProperties} aria-hidden="true">
            Aa
          </span>
          <span className={styles.code}>{s.name}</span>
        </li>
      ))}
    </ul>
  );
}

const sampleRows: { ticker: string; state: KitState; percent: number | null; known: number; sector: string }[] = [
  { ticker: "NVDA", state: "setup", percent: 81, known: 9, sector: "AI & semiconductors" },
  { ticker: "AVGO", state: "watch", percent: 64, known: 9, sector: "AI & semiconductors" },
  { ticker: "SHOP", state: "pullback", percent: 62.5, known: 8, sector: "Cloud & SaaS" },
  { ticker: "NET", state: "wait", percent: 52, known: 9, sector: "Cloud & SaaS" },
  { ticker: "AMD", state: "ignore", percent: 33, known: 7, sector: "AI & semiconductors" },
  { ticker: "PLTR", state: "broken", percent: null, known: 9, sector: "Additional growth" },
  { ticker: "CRWD", state: "insufficient", percent: null, known: 0, sector: "Cybersecurity" },
];

async function DesignKit({ params }: LocaleParams) {
  const locale: Locale = await resolveLocale(params);
  if (!designViewEnabled()) notFound();
  const m = getMessages(locale);
  const k = getKitMessages(locale);
  const d = k.design;
  const date = formatDate(locale, "2026-10-16");
  const dis = "design-disclaimer";
  const changes: StateChange[] = [
    ["NVDA", "watch", "setup"],
    ["SHOP", "watch", "pullback"],
    ["NET", "ignore", "wait"],
    ["PLTR", "setup", "broken"],
    ["AVGO", "wait", "watch"],
    ["CRWD", "wait", "insufficient"],
  ].map(([ticker, from, to]) => ({
    ticker,
    from: from as KitState,
    to: to as KitState,
    fromLabel: label(m, from as KitState),
    toLabel: label(m, to as KitState),
    href: `/${locale}/company/${ticker}`,
    sentence: fill(k.strip.changed, { ticker, from: label(m, from as KitState), to: label(m, to as KitState) }),
  }));
  const thresholds = { ratio: formatNumber(locale, 1.2, 1) };

  return (
    <article className={`frame page ${styles.page}`}>
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{d.title}</h1>
          <span className="stamp">{m.common.sample}</span>
        </div>
        <p className="lede">{d.lede}</p>
        <Disclaimer id={dis} text={m.common.disclaimer} />
      </header>

      <section aria-labelledby="kit-colour">
        <SectionHead id="kit-colour" title={d.sections.colour} lede={d.notes.colour} />
        <h3 className={styles.sub}>{d.swatches.neutrals}</h3>
        <Swatches items={neutrals} />
        <h3 className={styles.sub}>{d.swatches.signal}</h3>
        <Swatches items={signal} />
        <h3 className={styles.sub}>{d.swatches.bands}</h3>
        <Swatches items={bands.flatMap((b) => [{ name: `st-${b}-wash / st-${b}`, bg: `st-${b}-wash`, fg: `st-${b}` }, { name: `st-${b} / st-${b}-on`, bg: `st-${b}`, fg: `st-${b}-on` }])} />
        <h3 className={styles.sub}>{d.swatches.tier}</h3>
        <Swatches items={tier} />
        <div className={styles.depth} aria-hidden="true">
          <div>--shadow-1</div>
          <div>--shadow-2</div>
        </div>
      </section>

      <section aria-labelledby="kit-type">
        <SectionHead id="kit-type" title={d.sections.type} />
        <dl className={styles.typeList}>
          <div className={styles.typeRow}><dt>Display</dt><dd className={styles.displaySample}>{d.typeSamples.display}</dd></div>
          <div className={styles.typeRow}><dt>Title</dt><dd className="title">{d.typeSamples.title}</dd></div>
          <div className={styles.typeRow}><dt>Heading</dt><dd className="kit-section-title">{d.typeSamples.heading}</dd></div>
          <div className={styles.typeRow}><dt>Lede</dt><dd className="lede">{d.typeSamples.lede}</dd></div>
          <div className={styles.typeRow}><dt>Prose</dt><dd className="prose">{d.typeSamples.prose}</dd></div>
          <div className={styles.typeRow}><dt>UI</dt><dd>{d.typeSamples.ui}</dd></div>
          <div className={styles.typeRow}><dt>Label</dt><dd className="kit-label">{d.typeSamples.label}</dd></div>
          <div className={styles.typeRow}><dt>Figure</dt><dd className="kit-num" style={{ fontSize: "var(--t-figure-lg)", fontWeight: 640, letterSpacing: "-0.03em", lineHeight: 1 }}>{formatScorePercent(locale, 72)}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="kit-states">
        <SectionHead id="kit-states" title={d.sections.states} lede={d.notes.states} />
        <DataTable label={d.sections.states}>
          <thead>
            <tr>
              <th scope="col">{m.table.state}</th>
              <th scope="col">sm</th>
              <th scope="col">md</th>
              <th scope="col">lg</th>
              <th scope="col">icon</th>
            </tr>
          </thead>
          <tbody>
            {kitStates.map((state) => (
              <tr key={state}>
                <th scope="row" className="kit-num">{state}</th>
                <td><StateChip state={state} label={label(m, state)} size="sm" /></td>
                <td><StateChip state={state} label={label(m, state)} /></td>
                <td><StateChip state={state} label={label(m, state)} size="lg" describedBy={dis} /></td>
                <td><StateChip state={state} label={label(m, state)} iconOnly /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section aria-labelledby="kit-score">
        <SectionHead id="kit-score" title={d.sections.score} lede={d.notes.score} />
        <div className={styles.dials}>
          {sampleRows.map((row, i) => (
            <div key={row.ticker} className={styles.dialCell}>
              <ScoreDial percent={row.percent} state={row.state} stateLabel={label(m, row.state)} locale={locale} motion={i === 0 ? "load" : "none"} size={i === 0 ? "lg" : "md"} describedBy={dis} />
              <StateChip state={row.state} label={label(m, row.state)} size="sm" />
            </div>
          ))}
        </div>
        <div className={styles.bars}>
          {sampleRows.map((row, i) => (
            <div key={row.ticker} className={styles.barCell}>
              <ScoreBar percent={row.percent} state={row.state} stateLabel={label(m, row.state)} locale={locale} label={row.ticker} motion={i === 0 ? "load" : "view"} describedBy={dis} />
            </div>
          ))}
        </div>
        <div className={styles.bars}>
          {sampleRows.slice(0, 4).map((row) => (
            <ScoreBar key={row.ticker} percent={row.percent} state={row.state} stateLabel={label(m, row.state)} locale={locale} label={row.ticker} size="sm" />
          ))}
        </div>
      </section>

      <section aria-labelledby="kit-count">
        <SectionHead id="kit-count" title={d.sections.count} lede={d.notes.count} />
        <dl className={styles.counts}>
          <div><dt>{m.common.universe}</dt><dd><CountUp value={35} locale={locale} /></dd></div>
          <div><dt>{k.score.label}</dt><dd><CountUp value={72} locale={locale} format="percent" motion="view" /></dd></div>
          <div><dt>{k.score.label}</dt><dd><CountUp value={64.5} locale={locale} format="percent" /></dd></div>
          <div><dt>{m.table.ticker}</dt><dd><CountUp value={1234} locale={locale} /></dd></div>
        </dl>
      </section>

      <section aria-labelledby="kit-rules">
        <SectionHead id="kit-rules" title={d.sections.rules} lede={d.notes.rules} meta={<span className="stamp">{m.common.sample}</span>} />
        <RuleTable locale={locale} label={d.sections.rules} labelledBy="kit-rules" motion="load" describedBy={dis}>
          <tr className="kit-rule-group"><th colSpan={5} scope="colgroup">{m.groups.fundamentals}</th></tr>
          <RuleRow index={0} id="revenue-acceleration" locale={locale} name={m.rules["revenue-acceleration"]} needs={m.ruleThresholds["revenue-acceleration"]} detail={d.sample.ruleDetail} value={formatPercent(locale, 0.244)} result="pass" max={4} />
          <RuleRow index={1} id="earnings" locale={locale} name={m.rules.earnings} needs={m.ruleThresholds.earnings} value={m.common.yes} result="pass" max={3} />
          <tr className="kit-rule-group"><th colSpan={5} scope="colgroup">{m.groups.technical}</th></tr>
          <RuleRow index={2} id="above-ma" locale={locale} name={m.rules["above-ma"]} needs={m.ruleThresholds["above-ma"]} value={m.common.yes} result="pass" max={3} />
          <RuleRow index={3} id="green-volume" locale={locale} name={m.rules["green-volume"]} needs={fill(m.ruleThresholds["green-volume"], thresholds)} value={`${formatNumber(locale, 1.05, 2)}×`} result="fail" max={2} />
          <tr className="kit-rule-group"><th colSpan={5} scope="colgroup">{m.groups.macro}</th></tr>
          <RuleRow index={4} id="macro-data" locale={locale} name={m.rules["macro-data"]} needs={m.ruleThresholds["macro-data"]} detail={m.ruleDetails.unknown} result="none" max={3} />
        </RuleTable>
      </section>

      <section aria-labelledby="kit-strip">
        <SectionHead id="kit-strip" title={d.sections.strip} lede={d.notes.strip} />
        <div className={styles.stack}>
          <StateStrip label={fill(k.strip.label, { date })} changes={changes} empty={k.strip.empty} pauseLabel={k.strip.pause} playLabel={k.strip.play} />
          <StateStrip label={fill(k.strip.label, { date })} changes={[]} empty={k.strip.empty} pauseLabel={k.strip.pause} playLabel={k.strip.play} />
        </div>
      </section>

      <section aria-labelledby="kit-tier">
        <SectionHead id="kit-tier" title={d.sections.tier} lede={d.notes.tier} />
        <div className={styles.stack}>
          <div className={styles.row}>
            <TierBadge tier="free" label={k.tier.free} />
            <TierBadge tier="paid" label={k.tier.paid} />
          </div>
          <TierBanner mode="admin" title={k.banner.admin} note={k.banner.adminNote} badgeLabel={k.tier.paid} />
          <TierFrame badgeLabel={k.tier.paid} note={k.tier.paidSection}>
            <SectionHead as="h3" id="kit-tier-paid" title={d.sample.sectionTitle} lede={d.sample.sectionLede} rule="quiet" />
            <ScoreBar percent={64} state="watch" stateLabel={label(m, "watch")} locale={locale} label="AVGO" />
          </TierFrame>
          <div className={styles.onSheet}>
            <TierFrame tier="free" badgeLabel={k.tier.free}>
              <p className="prose">{d.typeSamples.prose}</p>
            </TierFrame>
          </div>
          <LockCard
            title={k.lock.title}
            behindLabel={k.lock.behind}
            items={d.sample.lockItems}
            status={<StateChip state="watch" label={label(m, "watch")} size="lg" describedBy={dis} />}
            statusNote={k.lock.statusKept}
            badgeLabel={k.tier.paid}
            action={{ href: `/${locale}/pricing`, label: k.lock.plans }}
          />
        </div>
      </section>

      <section aria-labelledby="kit-heads">
        <SectionHead id="kit-heads" title={d.sections.heads} lede={d.typeSamples.lede} meta={<><span>{d.sample.metaUpdated}</span><TierBadge tier="paid" label={k.tier.paid} /></>} />
        <SectionHead as="h3" id="kit-heads-quiet" title={d.sample.quietHead} rule="quiet" meta={<span className="stamp">{m.common.sample}</span>} />
      </section>

      <section aria-labelledby="kit-table">
        <SectionHead id="kit-table" title={d.sections.table} lede={d.notes.table} />
        <div className={styles.stack}>
          <DataTable label={d.sample.tableLabel} caption={d.sample.tableCaption} stickyFirst describedBy={dis}>
            <thead>
              <tr>
                <th scope="col">{d.sample.columns.ticker}</th>
                <th scope="col">{d.sample.columns.state}</th>
                <th scope="col" className="num">{d.sample.columns.score}</th>
                <th scope="col" className="num">{d.sample.columns.data}</th>
                <th scope="col">{d.sample.columns.sector}</th>
              </tr>
            </thead>
            <tbody>
              {[...sampleRows, ...sampleRows.map((r) => ({ ...r, ticker: `${r.ticker}.2` }))].map((row, i) => (
                <tr key={row.ticker} data-selected={i === 1 ? "" : undefined}>
                  <th scope="row"><span className="ticker">{row.ticker}</span></th>
                  <td><StateChip state={row.state} label={label(m, row.state)} size="sm" /></td>
                  <td className="num">{row.percent === null ? <span className="muted">{k.score.noScore}</span> : formatScorePercent(locale, row.percent)}</td>
                  <td className="num">{row.state === "insufficient" ? "" : `${row.known}/9`}</td>
                  <td>{m.sectors[row.sector as keyof Messages["sectors"]]}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <DataTable label={`${d.sample.tableLabel}, ${d.sample.empty}`} bounded={false} density="compact">
            <thead>
              <tr>
                <th scope="col">{d.sample.columns.ticker}</th>
                <th scope="col">{d.sample.columns.state}</th>
                <th scope="col" className="num">{d.sample.columns.score}</th>
              </tr>
            </thead>
            <tbody>
              <DataTableEmpty colSpan={3}>{d.sample.empty}</DataTableEmpty>
            </tbody>
          </DataTable>
        </div>
      </section>

      <section aria-labelledby="kit-surfaces">
        <SectionHead id="kit-surfaces" title={d.sections.surfaces} lede={d.notes.surfaces} />
        <div className={styles.stack}>
          <div className="actions" style={{ marginTop: 0 }}>
            <button type="button" className="button">{d.sample.buttonPrimary}</button>
            <button type="button" className="button secondary">{d.sample.buttonSecondary}</button>
            <button type="button" className="button" disabled>{d.sample.buttonDisabled}</button>
          </div>
          <label className={styles.field}>
            <span className="field-label">{d.sample.searchLabel}</span>
            <span className="search-field">
              <IconSearch />
              <input type="search" placeholder={d.sample.searchPlaceholder} />
            </span>
          </label>
          <div className={styles.scrollBox} role="region" aria-label={d.sections.surfaces} tabIndex={0}>
            <p>{d.typeSamples.prose}</p>
            <p>{d.notes.rules}</p>
            <p>{d.notes.count}</p>
            <p>{d.notes.strip}</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="kit-reveal">
        <SectionHead id="kit-reveal" title={d.sections.reveal} />
        <Reveal className={styles.revealBlock}>
          <p className="prose">{d.notes.reveal}</p>
          <ScoreBar percent={78} state="setup" stateLabel={label(m, "setup")} locale={locale} label="NVDA" motion="view" />
        </Reveal>
      </section>
    </article>
  );
}

export default withPageLog("/design", DesignKit);

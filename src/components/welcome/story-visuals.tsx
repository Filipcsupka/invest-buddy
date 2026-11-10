import type { CSSProperties } from "react";
import { SampleStamp } from "@/components/operator-disclosure";
import { CORE_RULES } from "@/engine/display-score";
import { fill, formatScorePercent, getMessages, locales, type Locale } from "@/i18n";
import { ruleGroups, type StateKey } from "@/i18n/rules";
import { rejectionChecks, ruleDetail, rulePointsText, ruleThreshold } from "@/i18n/score-text";
import { getWelcomeStoryMessages } from "@/i18n/welcome-messages-story";
import { Chip, G, Mark } from "./glyphs";
import { sampleHistory, sampleRows, type SampleRow } from "./sample-data";
import s from "./story.module.css";

/*
 * Data-rich blocks for the Welcome story. Every figure here is SAMPLE data from the invented sample universe, scored by the real engine,
 * except the counts in NumberTiles, which are read from the published rule set itself. Nothing reads the store or the network.
 * Markup is kept lean on purpose (styling by structure, not a class per cell): every element is sent twice, as HTML and RSC payload.
 */

const pct = (locale: Locale, n: number) => formatScorePercent(locale, n);
const ORDER: StateKey[] = ["setup", "watch", "wait", "ignore", "broken", "insufficient"];
const v = (n: number) => ({ "--v": Math.round(n * 1000) / 1000 }) as CSSProperties;

function CardHead({ title, lede, stamp }: { title: string; lede?: string; stamp?: string }) {
  return (
    <header className={s.cardHead}>
      <div>
        <h3 className={s.cardTitle}>{title}</h3>
        {lede ? <p>{lede}</p> : null}
      </div>
      {stamp ? <SampleStamp text={stamp} /> : null}
    </header>
  );
}

/* ---------- The method in numbers: true, checkable counts ---------- */

export function NumberTiles({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).facts_tiles;
  const [f, tech, macro] = ruleGroups.map((g) => g.max);
  const tiles = [
    { value: String(ruleGroups.flatMap((g) => g.rules).length), ...t.items.rules },
    { value: String(ruleGroups.reduce((sum, g) => sum + g.max, 0)), label: t.items.points.label, note: fill(t.items.points.note, { f: f!, t: tech!, m: macro! }) },
    { value: String(rejectionChecks(locale, sampleRows()[0]!.result).length), ...t.items.rejections },
    { value: String(ORDER.length), ...t.items.states },
    { value: String(locales.length), ...t.items.languages },
    t.items.cadence,
  ];
  return (
    <dl className={s.tiles} aria-label={t.title}>
      {tiles.map((tile) => (
        <div key={tile.label}>
          <dt><b className="num">{tile.value}</b> {tile.label}</dt>
          <dd>{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- The sample universe at a glance: state bars and a heat strip ---------- */

export function UniverseGlance({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeStoryMessages(locale);
  const rows = sampleRows();
  const counts = ORDER.map((state) => ({ state, n: rows.filter((row) => row.state === state).length }));
  const most = Math.max(...counts.map((c) => c.n));
  return (
    <div className={`kit-card ${s.glance}`}>
      <CardHead title={t.dist.title} stamp={t.dist.stamp} />
      <ul className={s.dist} aria-label={fill(t.dist.caption, { n: rows.length })}>
        {counts.map(({ state, n }) => (
          <li key={state} data-state={state}>
            <Chip state={state} label={m.states[state]} />
            <i style={v(n / most)} />
            <span className="num">{fill(t.dist.count, { n, total: rows.length })}</span>
          </li>
        ))}
      </ul>
      <p className={s.stripTitle}>{t.strip.title}</p>
      <ol className={s.strip}>
        {rows.map((row) => (
          <li key={row.company.ticker} data-state={row.state} style={{ flexGrow: Math.max(row.percent ?? 30, 30) }}>
            {row.company.ticker}
            <span className="num">{row.percent === null ? m.states[row.state] : pct(locale, row.percent)}</span>
          </li>
        ))}
      </ol>
      <p className={s.cardNote}>{t.strip.note}</p>
    </div>
  );
}

/* ---------- One company, every rule ---------- */

export function Checklist({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeStoryMessages(locale).checklist;
  const row = sampleRows()[0]!;
  const hits = new Map(row.result.ruleHits.map((hit) => [hit.id, hit]));
  const scored = CORE_RULES.map((rule) => ({ rule, hit: hits.get(rule.id) })).filter(({ hit }) => hit && !hit.unknown);
  const max = scored.reduce((sum, { rule }) => sum + rule.points, 0);
  const earned = scored.reduce((sum, { rule, hit }) => sum + (hit!.matched ? rule.points : 0), 0);
  return (
    <div className={`kit-card ${s.checklist}`}>
      <CardHead title={t.title} lede={t.lede} stamp={t.stamp} />
      <p className={s.checkCompany}>
        <b>{row.company.ticker}</b>
        {row.company.name}
        <Chip state={row.state} label={m.states[row.state]} />
      </p>
      <div className={s.tableScroll}>
        <table className={s.checkTable}>
          <caption className="visually-hidden">{t.title}: {row.company.name}</caption>
          <thead>
            <tr><th scope="col">{t.colRule}</th><th scope="col">{t.colNeeds}</th><th scope="col">{t.colValue}</th><th scope="col">{t.colResult}</th><th scope="col">{t.colPoints}</th></tr>
          </thead>
          {ruleGroups.map((group) => (
            <tbody key={group.group}>
              <tr><th scope="colgroup" colSpan={5}>{m.groups[group.group]}</th></tr>
              {group.rules.map((rule) => {
                const hit = hits.get(rule.id);
                const state = !hit || hit.unknown ? "no-data" : hit.matched ? "met" : "not-met";
                const result = state === "met" ? "pass" : state === "not-met" ? "fail" : "none";
                return (
                  <tr key={rule.id} data-result={result}>
                    <th scope="row">{m.rules[rule.id]}</th>
                    <td>{ruleThreshold(locale, rule.id)?.replace(/^[^:]+:\s*/, "") ?? ""}</td>
                    <td>{hit ? ruleDetail(locale, hit, row.result) : ""}</td>
                    <td><Mark result={result} />{m.common[state === "met" ? "yes" : state === "not-met" ? "no" : "unknown"]}</td>
                    <td>{rulePointsText(locale, state, rule.points)}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className={s.checkTotal}>{fill(t.total, { earned, max, percent: max ? pct(locale, Math.round((earned / max) * 1000) / 10) : "" })}</p>
    </div>
  );
}

/* ---------- Sample scanner with score history and a Plus continuation ---------- */

/** Score history as one polyline, 0 to 100 on a 32-unit box. */
const sparkPoints = (values: (number | null)[]) =>
  values.flatMap((value, i) => (value === null ? [] : [`${Math.round((i / (values.length - 1)) * 100)},${Math.round(30 - (value / 100) * 28)}`])).join(" ");

const groupPoints = (row: SampleRow) =>
  ruleGroups.map((g) => g.rules.reduce((sum, rule) => sum + (row.result.ruleHits.some((h) => h.id === rule.id && h.matched && !h.unknown) ? rule.points : 0), 0));

export function ScannerSample({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeStoryMessages(locale).scanner;
  const plus = getWelcomeStoryMessages(locale).areas.chips.plus;
  const sessions = 20;
  return (
    <div className={`kit-card ${s.scanner}`}>
      <CardHead title={t.title} lede={t.lede} stamp={t.stamp} />
      <ul className={s.filters} aria-label={t.filters.label}>
        <li data-on="">{t.filters.all}</li>
        <li>{m.states.setup}</li>
        <li>{m.states.watch}</li>
        <li>{t.filters.sector}</li>
        <li data-plus=""><G g="lock" />{t.filters.minScore}<b>{plus}</b></li>
      </ul>
      <div className={s.tableScroll}>
        <table className={s.scanTable}>
          <caption className="visually-hidden">{t.title}</caption>
          <thead>
            <tr>
              <th scope="col">{t.colCompany}</th>
              <th scope="col">{t.colState}</th>
              <th scope="col">{t.colScore}</th>
              <th scope="col"><abbr title={ruleGroups.map((g) => m.groups[g.group]).join(", ")}>{t.colGroups}</abbr></th>
              <th scope="col">{fill(t.colHistory, { n: sessions })}</th>
              <th scope="col"><G g="lock" />{t.colStreak}</th>
            </tr>
          </thead>
          <tbody>
            {sampleRows().map((row) => {
              const history = sampleHistory(row, sessions);
              const known = history.filter((x): x is number => x !== null);
              const [f, tech, mac] = groupPoints(row);
              return (
                <tr key={row.company.ticker} data-state={row.state}>
                  <th scope="row"><b>{row.company.ticker}</b>{row.company.name}</th>
                  <td><Chip state={row.state} label={m.states[row.state]} /></td>
                  <td>{row.percent === null ? "" : pct(locale, row.percent)}<i style={v((row.percent ?? 0) / 100)} /></td>
                  <td>{f} · {tech} · {mac}</td>
                  <td>
                    {known.length > 1 ? (
                      <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={fill(t.historyAria, { n: sessions, from: pct(locale, known[0]!), to: pct(locale, known.at(-1)!) })}>
                        <polyline points={sparkPoints(history)} />
                      </svg>
                    ) : null}
                  </td>
                  <td><span className="visually-hidden">{plus}</span><i aria-hidden="true">00</i></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Continuation art: blurred shapes only, no text or figures underneath. */}
        <div className={s.more}>
          <div aria-hidden="true"><i /><i /><i /></div>
          <p><G g="lock" />{t.more}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- How the track record will look: an invented series ---------- */

/** Deterministic invented index lines (no market data, no engine output): a small LCG walk so the chart is the same on every build. */
function invented(weeks: number) {
  let seed = 20261110;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const line = [100];
  const bench = [100];
  for (let i = 1; i < weeks; i++) {
    line.push(line[i - 1]! * (1 + (rnd() - 0.47) * 0.035));
    bench.push(bench[i - 1]! * (1 + (rnd() - 0.48) * 0.022));
  }
  return { line, bench };
}

export function RecordSample({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const t = getWelcomeStoryMessages(locale).record;
  const weeks = 52;
  const { line, bench } = invented(weeks);
  const all = [...line, ...bench];
  const lo = Math.floor(Math.min(...all) / 5) * 5;
  const hi = Math.ceil(Math.max(...all) / 5) * 5;
  const W = 640;
  const H = 220;
  const x = (i: number) => Math.round((i / (weeks - 1)) * W);
  const y = (n: number) => Math.round(H - ((n - lo) / (hi - lo)) * H);
  const path = (series: number[]) => `M${series.map((n, i) => `${x(i)} ${y(n)}`).join("L")}`;
  // Misses: sample tickers whose rules broke or fell away, at fixed weeks of the invented series.
  const out = sampleRows().filter((row) => row.state === "broken" || row.state === "ignore").map((row) => row.company.ticker);
  const misses = [{ week: 14, ticker: out[0] ?? "TDWR" }, { week: 31, ticker: out[1] ?? "SLTM" }, { week: 44, ticker: out[0] ?? "TDWR" }];
  const ticks = Array.from({ length: Math.round((hi - lo) / 5) + 1 }, (_, i) => lo + i * 5);
  return (
    <figure className={`kit-card ${s.recordCard}`}>
      <CardHead title={t.title} lede={t.lede} stamp={t.stamp} />
      <svg className={s.chart} viewBox={`-40 -10 ${W + 50} ${H + 30}`} role="img" aria-label={fill(t.aria, { n: weeks, misses: misses.length })}>
        <g className={s.grid}>
          {ticks.map((n) => <path key={n} d={`M0 ${y(n)}H${W}`} />)}
          {ticks.map((n) => <text key={n} x={-8} y={y(n) + 4}>{n}</text>)}
        </g>
        <path className={s.benchLine} d={path(bench)} />
        <path className={s.recLine} d={path(line)} />
        {misses.map((miss) => <circle key={`${miss.week}${miss.ticker}`} className={s.miss} cx={x(miss.week)} cy={y(line[miss.week]!)} r={5} />)}
      </svg>
      <figcaption className={s.legend}>
        <span data-k="line">{t.line}</span>
        <span data-k="bench">{t.bench}</span>
        <span data-k="miss">{t.miss}</span>
        <small>{t.axis}</small>
      </figcaption>
      <div className={s.events}>
        <p>{t.events}</p>
        <ul>
          {misses.map((miss) => <li key={`${miss.week}${miss.ticker}`}><G g="broken" />{fill(t.event, { week: miss.week, ticker: miss.ticker, state: m.states.broken })}</li>)}
        </ul>
      </div>
    </figure>
  );
}

/* ---------- Comparison: InvestBuddy, a spreadsheet, a typical screener ---------- */

const MARK = { yes: ["pass", "pass"], part: ["none", "part"], no: ["fail", "fail"] } as const;

export function Comparison({ locale }: { locale: Locale }) {
  const t = getWelcomeStoryMessages(locale).compare;
  return (
    <div className={`kit-card ${s.compareCard}`}>
      <CardHead title={t.title} lede={t.lede} />
      <div className={s.tableScroll}>
        <table className={s.vsTable}>
          <caption className="visually-hidden">{t.title}</caption>
          <thead>
            <tr><th scope="col">{t.colWhat}</th><th scope="col">{t.colUs}</th><th scope="col">{t.colSheet}</th><th scope="col">{t.colTypical}</th></tr>
          </thead>
          <tbody>
            {t.rows.map((row) => (
              <tr key={row.what}>
                <th scope="row">{row.what}</th>
                {([[row.us, row.u], [row.sheet, row.s], [row.typical, row.t]] as const).map(([text, kind], i) => {
                  const [result, glyph] = MARK[kind as keyof typeof MARK];
                  return <td key={i}><Mark result={result} glyph={glyph} />{text}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

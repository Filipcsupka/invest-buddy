"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { fill, getMessages } from "@/i18n";
import { ruleGroups, stateOrder, type StateKey } from "@/i18n/rules";
import { IconReset, IconSearch, IconSort } from "./icons";
import { DataTable } from "./kit/data-table";
import { ScoreBar } from "./kit/score";
import { StateChip } from "./kit/state-chip";
import { kitState } from "./kit/types";
import { StatusIcon } from "./status-slider";
import { useStateFilter } from "./state-filter";
import type { ScreenRow } from "./view-model";
import styles from "./scanner-table.module.css";

type SortKey = "ticker" | "sector" | "total" | "fundamentals" | "technical" | "macro" | "state";
type Text = {
  searchLabel: string;
  searchPlaceholder: string;
  filterLabel: string;
  allStates: string;
  clear: string;
  empty: string;
  showing: string;
  sortBy: string;
  disclaimer: string;
  extension: string;
  noScore: string;
  noRejection: string;
  columns: { ticker: string; sector: string; score: string; rules: string; state: string; data: string; criteria: string; f: string; t: string; m: string; fName: string; tName: string; mName: string };
  states: Record<StateKey, string>;
  held: string;
  heldNoSignal: string;
  rulesMet: string;
  rulesMetOf: string;
  hint?: string;
  rank?: { short: string; long: string };
  profileTags?: { event_driven: string; mixed: string; note: string };
  board?: { summaryLabel: string; lowerTitle: string; lowerBody: string; showLower: string; empty: string; stateNotes: Record<"setup" | "watch" | "broken", string> };
};

const ruleTotal = ruleGroups.reduce((sum, group) => sum + group.rules.length, 0);
const numeric: SortKey[] = ["total", "fundamentals", "technical", "macro"];

export function ScannerTable({ locale, rows, text, heldTickers = [], aside, profiles = {} }: { locale: string; rows: ScreenRow[]; text: Text; heldTickers?: string[]; aside?: ReactNode; profiles?: Record<string, string> }) {
  const held = new Set(heldTickers);
  const [query, setQuery] = useState("");
  const { state, setState } = useStateFilter();
  const [sort, setSort] = useState<{ key: SortKey; dir: "ascending" | "descending" }>({ key: "total", dir: "descending" });
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const disclaimerId = useId();
  const searchId = useId();

  const counts = useMemo(() => {
    const out = new Map<StateKey, number>();
    for (const row of rows) out.set(row.state, (out.get(row.state) ?? 0) + 1);
    return out;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    const sign = sort.dir === "ascending" ? 1 : -1;
    return rows
      .filter((row) => (state === "all" || row.state === state) && (!q || `${row.ticker} ${row.name} ${row.sector}`.toLocaleLowerCase(locale).includes(q)))
      .sort((a, b) => {
        const k = sort.key;
        const primary =
          k === "ticker" || k === "sector"
            ? a[k].localeCompare(b[k], locale)
            : k === "state"
              ? stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state)
              : k === "total" ? (a.percent ?? -1) - (b.percent ?? -1) : a[k] - b[k];
        return primary * sign || b.pointsKnown - a.pointsKnown || a.ticker.localeCompare(b.ticker);
      });
  }, [rows, query, state, sort, locale]);

  const header = (key: SortKey, label: string, className?: string, title?: string) => {
    const active = sort.key === key;
    const dir = active ? sort.dir : "none";
    return (
      <th scope="col" className={className} aria-sort={active ? sort.dir : undefined}>
        <button
          type="button"
          className="sort"
          title={title}
          aria-label={text.sortBy.replace("{column}", title ?? label)}
          onClick={() => setSort(active ? { key, dir: sort.dir === "ascending" ? "descending" : "ascending" } : { key, dir: numeric.includes(key) ? "descending" : "ascending" })}
        >
          {label}
          <IconSort direction={dir} />
        </button>
      </th>
    );
  };

  const filtered = query !== "" || state !== "all";
  const groups = ["setup", "watch", "broken", "lower"] as const;
  const groupRows = (group: (typeof groups)[number]) => visible.filter((row) => group === "lower" ? !["setup", "watch", "broken"].includes(row.state) : row.state === group);
  const clearAll = () => { setQuery(""); setState("all"); };
  const table = (list: ScreenRow[], group: string) => {
    const label = text.board ? (group === "lower" ? text.board.lowerTitle : text.states[group as StateKey]) : text.showing.replace("{shown}", String(list.length)).replace("{total}", String(rows.length));
    return (
    <DataTable key={group} label={label} density="compact" bounded={group === "lower"} stickyFirst describedBy={disclaimerId} className={group === "broken" ? `${styles.grid} ${styles.gridReason}` : styles.grid}>
      <colgroup><col className={styles.cCompany} /><col className={styles.cSector} /><col className={styles.cScore} /><col className={styles.cRules} /><col className={styles.cState} />{group === "broken" ? <col /> : null}</colgroup>
      <caption className="visually-hidden">{label}</caption>
      <thead><tr>
        {header("ticker", text.rank ? `${text.rank.short} · ${text.columns.ticker}` : text.columns.ticker, undefined, text.columns.ticker)}
        {header("sector", text.columns.sector, `col-sector ${styles.colSector}`)}
        {header("total", text.columns.score, "col-score")}
        <th scope="col" className={styles.colRules}>{text.rulesMet}</th>
        {header("state", text.columns.state)}
        {group === "broken" && <th scope="col" className="col-reason">{text.columns.criteria}</th>}
      </tr></thead>
      <tbody>{list.map((row, index) => {
        const chipState = kitState(row.state, Boolean(row.pullbackLabel));
        const met = row.matched?.length ?? null;
        return (
        <tr key={row.ticker} data-state={row.state}>
          <th scope="row" className={`col-company ${styles.company}`}>
            <span className={styles.rank} aria-label={`${text.rank?.long ?? ""} ${index + 1}`.trim()}>{index + 1}</span>
            <span className={styles.who}>
              <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link>
              <span className="company-name">{row.name}
                {row.agreementLabel ? <span className="tag">{row.agreementLabel}</span> : null}
                {text.profileTags && profiles[row.ticker] && profiles[row.ticker] in text.profileTags ? <span className="tag" title={text.profileTags.note}>{text.profileTags[profiles[row.ticker] as "event_driven" | "mixed"]}</span> : null}
                {row.extension ? <span className="tag">{text.extension}</span> : null}
                {held.has(row.ticker) ? <span className="tag">{row.state === "setup" || row.state === "watch" ? text.held : text.heldNoSignal}</span> : null}
              </span>
            </span>
          </th>
          <td className={`col-sector muted ${styles.colSector}`}><span className={styles.mobileLabel}>{text.columns.sector}</span>{row.sector}</td>
          <td className={`col-score ${styles.score}`}>
            <span className={styles.mobileLabel}>{text.columns.score}</span>
            <ScoreBar size="sm" percent={row.percent} state={chipState} stateLabel={row.pullbackLabel ?? row.stateLabel} locale={locale as "en" | "sk"} label={row.ticker} describedBy={disclaimerId} />
            {row.percent === null ? null : <span className={`small muted ${styles.coverage}`}>{fill(getMessages(locale as "en" | "sk").status.coreData, { known: row.pointsKnown, total: row.coreTotal })}</span>}
          </td>
          <td className={styles.colRules}><span className={styles.mobileLabel}>{text.rulesMet}</span>{met === null ? <span className="muted">–</span> : <span className={styles.rules}>
            <span className={styles.pips} aria-hidden="true">{Array.from({ length: ruleTotal }, (_, i) => <i key={i} data-on={i < met ? "" : undefined} />)}</span>
            <span className="num">{fill(text.rulesMetOf, { met, total: ruleTotal })}</span></span>}</td>
          <td><span className={styles.mobileLabel}>{text.columns.state}</span><StateChip state={chipState} label={row.pullbackLabel ?? row.stateLabel} size="sm" describedBy={disclaimerId} /></td>
          {group === "broken" && <td className="col-reason muted"><span className={styles.mobileLabel}>{text.columns.criteria}</span>{row.reasons.length ? row.reasons.join("; ") : text.noRejection}</td>}
        </tr>
        );
      })}</tbody>
    </DataTable>
    );
  };

  const board = text.board;
  const firstGroup = groups.find((group) => groupRows(group).length > 0);
  return (
    <div className={styles.board}>
      <div className={styles.wrap}>
        {board ? <div className={styles.kpis} role="group" aria-label={board.summaryLabel}>
          {stateOrder.map((key) => {
            const count = counts.get(key) ?? 0;
            const share = rows.length ? Math.round((count / rows.length) * 100) : 0;
            return <button key={key} type="button" className={styles.kpi} data-state={key} aria-pressed={state === key} disabled={count === 0 && state !== key} onClick={() => setState(state === key ? "all" : key)}>
              <span className={styles.kpiTop}><span className={styles.kpiIcon} aria-hidden="true"><StatusIcon state={key} /></span><span className={styles.kpiLabel}>{text.states[key]}</span></span>
              <span className={`num ${styles.kpiCount}`}>{count}</span>
              <span className={styles.kpiBar} aria-hidden="true"><span style={{ width: `${share}%` }} /></span>
            </button>;
          })}
        </div> : null}
        {board && text.hint ? <p className={styles.hint}>{text.hint}</p> : null}

        <div className={styles.cols}>
          <div className={styles.mainCol}>
            <div className={styles.bar}>
              <div className={styles.search}>
                <label htmlFor={searchId} className="visually-hidden">{text.searchLabel}</label>
                <span className={styles.searchField}>
                  <IconSearch />
                  <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPlaceholder} autoComplete="off" spellCheck={false} />
                </span>
              </div>
              <fieldset className={styles.chips}>
                <legend className="visually-hidden">{text.filterLabel}</legend>
                {(["all", ...stateOrder] as const).map((key) => {
                  const count = key === "all" ? rows.length : (counts.get(key) ?? 0);
                  return (
                    <label key={key} className={styles.chip} data-state={key} data-empty={count === 0 || undefined}>
                      <input type="radio" name="state" value={key} checked={state === key} disabled={count === 0} onChange={() => setState(key)} />
                      {key === "all" ? null : <StatusIcon state={key} />}<span>{key === "all" ? text.allStates : text.states[key]}</span>
                    </label>
                  );
                })}
              </fieldset>
              <div className={styles.count}>
                <span className="num" aria-live="polite">{text.showing.replace("{shown}", String(visible.length)).replace("{total}", String(rows.length))}</span>
                {filtered ? <button type="button" className="text-button" onClick={clearAll}><IconReset />{text.clear}</button> : null}
              </div>
            </div>
            <p className="disclaimer is-compact" id={disclaimerId}>{text.disclaimer}</p>
            {board ? groups.map((group) => {
              const list = groupRows(group);
              if (group === "lower") return <details className={styles.group} key={group} open={filtered || (narrow && group === firstGroup) || undefined} aria-labelledby="lower">
                <summary className={styles.groupHead}>
                  <span className={styles.groupTitle}><h2 id="lower">{board.lowerTitle}</h2><span className={`num ${styles.groupCount}`}>{list.length}</span></span>
                  <span className={styles.groupNote}>{board.lowerBody}</span><span className={styles.chev} aria-hidden="true" />
                </summary>
                {table(list, group)}
              </details>;
              if (!list.length && filtered) return null;
              return <details className={styles.group} key={group} open={filtered || (narrow && group === firstGroup) || undefined} aria-labelledby={`state-${group}`}>
                <summary className={styles.groupHead}>
                  <span className={styles.groupTitle}><h2 id={`state-${group}`} className={styles.fit}><StateChip state={group} label={text.states[group]} size="lg" /></h2><span className={`num ${styles.groupCount}`}>{list.length}</span></span>
                  <span className={styles.groupNote}>{board.stateNotes[group]}</span><span className={styles.chev} aria-hidden="true" />
                </summary>
                {list.length ? table(list, group) : <p className={styles.emptyLine}>{board.empty}</p>}
              </details>;
            }) : table(visible, "all")}
            {visible.length === 0 ? <div className={styles.empty} role="status">
              <span className={styles.emptyIcon} aria-hidden="true"><IconSearch /></span>
              <p>{text.empty}</p>
              {filtered ? <button type="button" className="button secondary" onClick={clearAll}><IconReset />{text.clear}</button> : null}
            </div> : null}
          </div>
          {aside ? <aside className={styles.aside}>{aside}</aside> : null}
        </div>
      </div>
    </div>
  );
}

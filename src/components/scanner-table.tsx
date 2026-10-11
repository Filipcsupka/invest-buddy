"use client";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { IconReset, IconSearch, IconSort } from "./icons";
import { ScoreMark } from "./score-mark";
import { DataCell, StatusBadge, StatusCell, StatusIcon } from "./status-slider";
import type { ScreenRow } from "./view-model";

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
  board?: { summaryLabel: string; lowerTitle: string; lowerBody: string; showLower: string; empty: string; stateNotes: Record<"setup" | "watch" | "broken", string> };
};

const numeric: SortKey[] = ["total", "fundamentals", "technical", "macro"];

export function ScannerTable({ locale, rows, text, heldTickers = [] }: { locale: string; rows: ScreenRow[]; text: Text; heldTickers?: string[] }) {
  const held = new Set(heldTickers);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateKey | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "ascending" | "descending" }>({ key: "total", dir: "descending" });
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
              : a[k] - b[k];
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
  const table = (list: ScreenRow[], group: string) => (
    <div className="table-scroll" key={group}>
      <table className="screen">
        <caption className="visually-hidden">{text.board ? (group === "lower" ? text.board.lowerTitle : text.states[group as StateKey]) : text.showing.replace("{shown}", String(list.length)).replace("{total}", String(rows.length))}</caption>
        <thead><tr>
          {header("ticker", text.columns.ticker)}
          {header("sector", text.columns.sector, "col-sector")}
          {header("total", text.columns.score, "col-score")}
          {header("fundamentals", text.columns.f, "col-part", text.columns.fName)}
          {header("technical", text.columns.t, "col-part", text.columns.tName)}
          {header("macro", text.columns.m, "col-part", text.columns.mName)}
          <th scope="col" className="col-mark">{text.columns.rules}</th>
          {header("state", text.columns.state)}
          <th scope="col" className="col-data">{text.columns.data}</th>
          {group === "broken" && <th scope="col" className="col-reason">{text.columns.criteria}</th>}
        </tr></thead>
        <tbody>{list.map((row) => (
          <tr key={row.ticker} data-state={row.state}>
            <th scope="row" className="col-company">
              <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>{row.ticker}</Link>
              <span className="company-name">{row.name}
                {row.agreementLabel ? <span className="tag">{row.agreementLabel}</span> : null}
                {row.extension ? <span className="tag">{text.extension}</span> : null}
                {held.has(row.ticker) ? <span className="tag">{row.state === "setup" || row.state === "watch" ? text.held : text.heldNoSignal}</span> : null}
              </span>
            </th>
            <td className="col-sector muted">{row.sector}</td>
            <td className="col-score num" aria-describedby={disclaimerId}>{row.state === "insufficient" ? <span className="muted">{text.noScore}</span> : row.pointsNote ? <span title={row.pointsNote}>(<s>{row.total}</s>)<span className="visually-hidden">{row.pointsNote}</span></span> : row.total}</td>
            <td className="col-part num">{row.fundamentals}</td>
            <td className="col-part num">{row.technical}</td>
            <td className="col-part num">{row.macro}</td>
            <td className="col-mark"><ScoreMark matched={row.matched} state={row.state} label={row.markLabel} /></td>
            <td><StatusCell state={row.state} position={row.position} label={row.stateLabel} ariaLabel={row.statusAria} pullbackLabel={row.pullbackLabel} describedBy={disclaimerId} /></td>
            <td className="col-data"><DataCell known={row.pointsKnown} noDataRules={row.noDataRules} scored={row.state !== "insufficient"} /></td>
            {group === "broken" && <td className="col-reason muted">{row.reasons.length ? row.reasons.join("; ") : text.noRejection}</td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );

  return (
    <div className="scanner">
      <div className="controls">
        <div className="search">
          <label htmlFor={searchId} className="field-label">
            {text.searchLabel}
          </label>
          <span className="search-field">
            <IconSearch />
            <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.searchPlaceholder} autoComplete="off" spellCheck={false} />
          </span>
        </div>
        <fieldset className="state-filter">
          <legend className="field-label">{text.filterLabel}</legend>
          <div className="segments">
            {(["all", ...stateOrder] as const).map((key) => {
              const count = key === "all" ? rows.length : (counts.get(key) ?? 0);
              return (
                <label key={key} className="segment" data-state={key} data-empty={count === 0 || undefined}>
                  <input type="radio" name="state" value={key} checked={state === key} disabled={count === 0} onChange={() => setState(key)} />
                  {key === "all" ? null : <StatusIcon state={key} />}<span>{key === "all" ? text.allStates : text.states[key]}</span>
                  <span className="num segment-count">{count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="caption-row">
        <span className="num" aria-live="polite">{text.showing.replace("{shown}", String(visible.length)).replace("{total}", String(rows.length))}</span>
        {filtered ? <button type="button" className="text-button" onClick={() => { setQuery(""); setState("all"); }}><IconReset />{text.clear}</button> : null}
      </div>
      <p className="disclaimer is-compact" id={disclaimerId}>{text.disclaimer}</p>
      {text.board ? <>
        <table className="tally"><caption className="visually-hidden">{text.board.summaryLabel}</caption><tbody><tr>{stateOrder.map((key) => <td key={key} data-state={key}><a href={key === "wait" || key === "ignore" || key === "insufficient" ? "#lower" : `#state-${key}`} className="tally-cell"><span className="tally-label"><StatusIcon state={key} /> {text.states[key]}</span><span className="num tally-count">{counts.get(key) ?? 0}</span></a></td>)}</tr></tbody></table>
        {groups.map((group) => {
          const list = groupRows(group);
          if (group === "lower") return <section className="board-section" aria-labelledby="lower" key={group}>
            <div className="board-head"><h2 id="lower">{text.board!.lowerTitle}</h2><p className="board-note">{text.board!.lowerBody}</p></div>
            <details className="disclosure-block" open={filtered || undefined}><summary>{text.board!.showLower.replace("{count}", String(list.length))}</summary>{table(list, group)}</details>
          </section>;
          if (!list.length && filtered) return null;
          return <section className="board-section" aria-labelledby={`state-${group}`} key={group}>
            <div className="board-head"><h2 id={`state-${group}`}><StatusBadge state={group} label={text.states[group]} /><span className="num board-count">{list.length}</span></h2><p className="board-note">{text.board!.stateNotes[group]}</p></div>
            {list.length ? table(list, group) : <p className="empty-line">{text.board!.empty}</p>}
          </section>;
        })}
      </> : table(visible, "all")}
      {visible.length === 0 ? <div className="empty" role="status"><p>{text.empty}</p><button type="button" className="button secondary" onClick={() => { setQuery(""); setState("all"); }}><IconReset />{text.clear}</button></div> : null}
    </div>
  );
}

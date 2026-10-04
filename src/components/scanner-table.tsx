"use client";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { IconReset, IconSearch, IconSort } from "./icons";
import { ScoreMark } from "./score-mark";
import { StateChip } from "./score-badge";
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
  columns: { ticker: string; sector: string; score: string; rules: string; state: string; f: string; t: string; m: string; fName: string; tName: string; mName: string };
  states: Record<StateKey, string>;
};

const numeric: SortKey[] = ["total", "fundamentals", "technical", "macro"];

export function ScannerTable({ locale, rows, text }: { locale: string; rows: ScreenRow[]; text: Text }) {
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
        return primary * sign || a.ticker.localeCompare(b.ticker);
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
                  <span>{key === "all" ? text.allStates : text.states[key]}</span>
                  <span className="num segment-count">{count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="table-scroll">
        <table className="screen">
          <caption>
            <span className="caption-row">
              <span className="num" aria-live="polite">
                {text.showing.replace("{shown}", String(visible.length)).replace("{total}", String(rows.length))}
              </span>
              {filtered ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setState("all");
                  }}
                >
                  <IconReset />
                  {text.clear}
                </button>
              ) : null}
            </span>
            <span className="disclaimer is-compact" id={disclaimerId}>
              {text.disclaimer}
            </span>
          </caption>
          <thead>
            <tr>
              {header("ticker", text.columns.ticker)}
              {header("sector", text.columns.sector, "col-sector")}
              {header("total", text.columns.score, "col-score")}
              {header("fundamentals", text.columns.f, "col-part", text.columns.fName)}
              {header("technical", text.columns.t, "col-part", text.columns.tName)}
              {header("macro", text.columns.m, "col-part", text.columns.mName)}
              <th scope="col" className="col-mark">
                {text.columns.rules}
              </th>
              {header("state", text.columns.state)}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.ticker} data-state={row.state}>
                <th scope="row" className="col-company">
                  <Link className="ticker" href={`/${locale}/company/${row.ticker}`}>
                    {row.ticker}
                  </Link>
                  <span className="company-name">
                    {row.name}
                    {row.extension ? <span className="tag">{text.extension}</span> : null}
                  </span>
                </th>
                <td className="col-sector muted">{row.sector}</td>
                <td className="col-score num" aria-describedby={disclaimerId}>
                  {row.state === "insufficient" ? <span className="muted">{text.noScore}</span> : row.total}
                </td>
                <td className="col-part num">{row.fundamentals}</td>
                <td className="col-part num">{row.technical}</td>
                <td className="col-part num">{row.macro}</td>
                <td className="col-mark">
                  <ScoreMark matched={row.matched} state={row.state} label={row.markLabel} />
                </td>
                <td>
                  <StateChip state={row.state} label={row.stateLabel} pullbackLabel={row.pullbackLabel} describedBy={disclaimerId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <div className="empty" role="status">
            <p>{text.empty}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setQuery("");
                setState("all");
              }}
            >
              <IconReset />
              {text.clear}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

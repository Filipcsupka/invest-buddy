import type { ReactNode } from "react";
import { formatNumber, type Locale } from "@/i18n";
import type { DataRow } from "./store";
import s from "./data.module.css";

const display = (value: unknown, key: string, locale: Locale): ReactNode => {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return <code className={s.json}>{JSON.stringify(value)}</code>;
  if (key === "close" && Number.isFinite(Number(value))) return formatNumber(locale, Number(value), 2);
  return String(value);
};

export function DataTable({ rows, columns, empty, locale = "en" }: { rows: DataRow[]; columns: { key: string; label: string }[]; empty: string; locale?: Locale }) {
  if (!rows.length) return <p className={s.empty}>{empty}</p>;
  return <div className={s.scroll}><table className={s.table}><thead><tr>{columns.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((c) => <td key={c.key}>{display(row[c.key], c.key, locale)}</td>)}</tr>)}</tbody></table></div>;
}

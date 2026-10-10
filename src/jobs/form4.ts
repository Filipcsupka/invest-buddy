import type pg from "pg";
import { companyfactsSubjects } from "./companyfacts";
import { defaultHttp } from "../collectors/sources/client";
import { getText } from "../collectors/http";
import { filingRows, filingUrl, form4RawPath, parseForm4Transactions } from "../collectors/edgar";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { PostgresCollectorRepository } from "../db/collectors";
import type { BackfillJob } from "./backfill";

const START = "2023-10-01";
type Recent = Parameters<typeof filingRows>[0];
type Filing = { accession: string; primary: string; date: string };
type Cursor = { cik: number; pages: string[]; rows: Filing[]; index: number };
// Match the daily insider fact's Form 4 scope. Amendments need supersession links before they can enter net sums.
const filings = (recent: Recent): Filing[] => filingRows(recent, START).filter((row) => row.form === "4").map(({ accession, primary, date }) => ({ accession, primary, date }));
const submissionUrl = (cik: number) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;

/** Each step requests one SEC resource; the runner checkpoints before fetching the next one. */
export function createForm4BackfillJob(db: Pick<pg.Pool, "query">, get: (url: string) => Promise<string> = getText,
  loadSubjects: () => Promise<{ ticker: string; cik: number }[]> = () => companyfactsSubjects(db, defaultHttp())): BackfillJob {
  const repo = new PostgresCollectorRepository(db as pg.Pool);
  let subjects: { ticker: string; cik: number }[] = [];
  return { name: "form4", source: "sec",
    async subjects() { subjects = await loadSubjects(); return subjects.map((row) => row.ticker); },
    async step(ticker, previous) {
      const subject = subjects.find((row) => row.ticker === ticker);
      if (!subject) throw new Error(`Unknown Form 4 subject ${ticker}`);
      let cursor = previous as Cursor | null;
      if (!cursor) {
        const data = JSON.parse(await get(submissionUrl(subject.cik))) as { filings: { recent: Recent; files?: { name: string; filingFrom: string; filingTo: string }[] } };
        cursor = { cik: subject.cik,
          pages: (data.filings.files ?? []).filter((page) => page.filingTo >= START).map((page) => page.name),
          rows: filings(data.filings.recent), index: 0 };
        return { cursor, done: !cursor.rows.length && !cursor.pages.length };
      }
      if (cursor.index < cursor.rows.length) {
        const row = cursor.rows[cursor.index];
        const base = `https://www.sec.gov/Archives/edgar/data/${cursor.cik}/${row.accession.replace(/-/g, "")}/`;
        const xml = await get(filingUrl(base, form4RawPath(row.primary)));
        await repo.upsertInsiderTransactions(row.accession, ticker, row.date, parseForm4Transactions(xml));
        cursor = { ...cursor, index: cursor.index + 1 };
        return { cursor, done: cursor.index >= cursor.rows.length && !cursor.pages.length };
      }
      const [page, ...pages] = cursor.pages;
      if (!/^[A-Za-z0-9_.-]+\.json$/.test(page)) throw new Error("Invalid SEC submission page name");
      const data = JSON.parse(await get(`https://data.sec.gov/submissions/${page}`)) as Recent;
      cursor = { ...cursor, pages, rows: filings(data), index: 0 };
      return { cursor, done: !cursor.rows.length && !cursor.pages.length };
    },
  };
}

export function guardForm4Backfill() { requireSecUserAgent(process.env.SEC_USER_AGENT); }

import type pg from "pg";
import { companyfactsSubjects } from "./companyfacts";
import { defaultHttp } from "../collectors/sources/client";
import { getText } from "../collectors/http";
import { eightKExhibits, filingBase, filingRows, filingUrl } from "../collectors/edgar";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { archiveFiling, archivedAccessions } from "../data/filing-archive";
import type { BackfillJob } from "./backfill";

/** Filings from this date on are archived (roadmap D19). Form 4 is D20's job. */
export const FILINGS_START = "2023-10-01";
type Recent = Parameters<typeof filingRows>[0];
type Filing = { a: string; f: string; d: string; i: string; n: string };
/** `p` fetch the primary document, `ix` fetch the 8-K index, `x` fetch one exhibit. Short keys keep the saved cursor small. */
type Task = { k: "p" | "ix" | "x"; a: string; f: string; d: string; i: string; n: string; t?: string };
type Cursor = { cik: number; pages: string[]; todo: Task[] };
type SubmissionsPage = { name: string; filingFrom: string; filingTo: string };

const submissionUrl = (cik: number) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
const filings = (recent: Recent): Filing[] => filingRows(recent, FILINGS_START).filter((row) => row.form !== "4")
  .map((row) => ({ a: row.accession, f: row.form, d: row.date, i: row.items, n: row.primary }));

/**
 * One SEC request per step: the submissions list, then each filing's primary document, then for an 8-K its index and exhibits.
 * Filings already in `filings` are skipped without a request. The cursor holds the remaining work, so a crash or cap resumes at the next request.
 */
export function createFilingsBackfillJob(db: Pick<pg.Pool, "query">, get: (url: string) => Promise<string> = getText,
  loadSubjects: () => Promise<{ ticker: string; cik: number }[]> = () => companyfactsSubjects(db, defaultHttp())): BackfillJob {
  let subjects: { ticker: string; cik: number }[] = [];
  const queue = async (recent: Recent): Promise<Task[]> => {
    const rows = filings(recent);
    const have = await archivedAccessions(db, rows.map((row) => row.a));
    return rows.filter((row) => !have.has(row.a)).map((row) => ({ k: "p" as const, ...row }));
  };
  return { name: "filings", source: "sec",
    async subjects() { subjects = await loadSubjects(); return subjects.map((row) => row.ticker); },
    async step(ticker, previous) {
      const subject = subjects.find((row) => row.ticker === ticker);
      if (!subject) throw new Error(`Unknown filings subject ${ticker}`);
      const cursor = previous as Cursor | null;
      const finish = (next: Cursor) => ({ cursor: next, done: !next.todo.length && !next.pages.length });
      if (!cursor) {
        const data = JSON.parse(await get(submissionUrl(subject.cik))) as { filings: { recent: Recent; files?: SubmissionsPage[] } };
        return finish({ cik: subject.cik, pages: (data.filings.files ?? []).filter((page) => page.filingTo >= FILINGS_START).map((page) => page.name), todo: await queue(data.filings.recent) });
      }
      if (cursor.todo.length) {
        const [task, ...rest] = cursor.todo;
        const base = filingBase(cursor.cik, task.a);
        const file = { ticker, cik: cursor.cik, accession: task.a, form: task.f, filedAt: task.d, items: task.i };
        if (task.k === "ix") {
          const index = JSON.parse(await get(`${base}index.json`)) as { directory?: { item?: { name: string; type?: string }[] } };
          const exhibits = eightKExhibits(index.directory?.item ?? [], task.n, task.i).map((exhibit) => ({ ...task, k: "x" as const, n: exhibit.name, t: exhibit.docType }));
          return finish({ ...cursor, todo: [...exhibits, ...rest] });
        }
        const url = filingUrl(base, task.n);
        const body = await get(url);
        await archiveFiling(db, { ...file, docType: task.k === "x" ? task.t! : task.f, name: task.n, url, body });
        // An 8-K gets an index step next; the cursor is saved after this request, so a crash retries only the last request.
        const next = task.k === "p" && (task.f === "8-K" || task.f === "8-K/A") ? [{ ...task, k: "ix" as const }, ...rest] : rest;
        return finish({ ...cursor, todo: next });
      }
      const [page, ...pages] = cursor.pages;
      if (!/^[A-Za-z0-9_.-]+\.json$/.test(page)) throw new Error("Invalid SEC submission page name");
      const data = JSON.parse(await get(`https://data.sec.gov/submissions/${page}`)) as Recent;
      return finish({ ...cursor, pages, todo: await queue(data) });
    },
  };
}

export function guardFilingsBackfill() { requireSecUserAgent(process.env.SEC_USER_AGENT); }

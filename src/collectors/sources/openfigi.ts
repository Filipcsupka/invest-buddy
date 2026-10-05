import { cusipIsFresh, type CusipStore } from "../../db/source-collectors";
import { defaultHttp, type RequestOptions, type SourceHttp } from "./client";
import { marketTicker, parseJson, PING_REQUEST, runPing, type Company, type PingResult } from "./common";

export const FIGI_URL = "https://api.openfigi.com/v3/mapping";
/** Without a key: 10 jobs per request, 25 requests per minute. The client spaces requests 2.5 s apart. */
export const JOBS_PER_REQUEST = 10;
interface FigiRow { figi?: string; name?: string; ticker?: string; exchCode?: string; securityType?: string }
type FigiAnswer = { data?: FigiRow[]; warning?: string; error?: string };
export interface Mapped { cusip: string; ticker: string | null; figi: string | null; name: string | null }

/** Prefer the US composite listing. Warrants, rights and options are not common stock. */
export function pickListing(rows: FigiRow[]): FigiRow | undefined {
  const common = rows.filter((row) => row.ticker && (!row.securityType || /common|adr|depositary|ordinary/i.test(row.securityType)));
  return common.find((row) => row.exchCode === "US") ?? common[0];
}

export async function mapCusips(http: SourceHttp, cusips: string[], options: RequestOptions = PING_REQUEST): Promise<Mapped[]> {
  const body = cusips.map((cusip) => ({ idType: "ID_CUSIP", idValue: cusip }));
  const answers = parseJson<FigiAnswer[]>(await http.post(FIGI_URL, body, options), "OpenFIGI");
  if (!Array.isArray(answers) || answers.length !== cusips.length) throw new Error("OpenFIGI: answer does not match request size");
  return answers.map((answer, i) => {
    if (answer.error) throw new Error(`OpenFIGI: ${answer.error}`);
    const pick = pickListing(answer.data ?? []);
    return { cusip: cusips[i], ticker: pick?.ticker?.toUpperCase() ?? null, figi: pick?.figi ?? null, name: pick?.name ?? null };
  });
}

/**
 * Resolves CUSIPs for universe names only. A CUSIP that maps to a ticker outside the universe is cached as "not ours".
 * `maxRequests` bounds one run; leftovers are resolved next run.
 */
export async function resolveUniverseCusips(http: SourceHttp, store: CusipStore, cusips: string[], companies: Company[], now: Date, maxRequests = 30): Promise<Map<string, string>> {
  const cached = await store.get(cusips);
  const out = new Map<string, string>();
  const todo: string[] = [];
  for (const cusip of cusips) {
    const entry = cached.get(cusip);
    if (entry && cusipIsFresh(entry, now)) { if (entry.symbol) out.set(cusip, entry.symbol); } else todo.push(cusip);
  }
  const bySymbol = new Map(companies.flatMap((company) => [[company.symbol, company.symbol], [marketTicker(company.symbol), company.symbol]] as const));
  for (let i = 0, requests = 0; i < todo.length && requests < maxRequests; i += JOBS_PER_REQUEST, requests++) {
    for (const mapped of await mapCusips(http, todo.slice(i, i + JOBS_PER_REQUEST), { timeoutMs: 15_000 })) {
      const symbol = mapped.ticker ? bySymbol.get(mapped.ticker) ?? null : null;
      await store.put({ cusip: mapped.cusip, symbol, figi: mapped.figi, name: mapped.name });
      if (symbol) out.set(mapped.cusip, symbol);
    }
  }
  return out;
}

/** NVIDIA common stock CUSIP, used only as a probe. */
const PROBE_CUSIP = "67066G104";
export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("openfigi", async () => {
  const [mapped] = await mapCusips(http, [PROBE_CUSIP]);
  if (mapped.ticker !== "NVDA") throw new Error(`expected NVDA, got ${mapped.ticker ?? "nothing"}`);
  return `${PROBE_CUSIP} maps to ${mapped.ticker}`;
});

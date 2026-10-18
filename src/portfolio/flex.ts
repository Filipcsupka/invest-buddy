import { XMLParser, XMLValidator } from "fast-xml-parser";

const endpoint = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false });
const retryCodes = new Set(["1001", "1018", "1019"]);

function parse(xml: string): Record<string, unknown> {
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid Flex XML");
  return parser.parse(xml) as Record<string, unknown>;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export interface FlexTransport { (url: string): Promise<string> }
const httpTransport: FlexTransport = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Flex HTTP ${response.status}`);
  return response.text();
};

export class FlexService {
  constructor(private readonly token: string, private readonly queryId: string, private readonly transport: FlexTransport = httpTransport, private readonly pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    if (!token || !queryId) throw new Error("Flex credentials are required");
  }

  async statement(maxAttempts = 8): Promise<string> {
    let reference = "";
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = reference
        ? `${endpoint}/GetStatement?t=${encodeURIComponent(this.token)}&q=${encodeURIComponent(reference)}&v=3`
        : `${endpoint}/SendRequest?t=${encodeURIComponent(this.token)}&q=${encodeURIComponent(this.queryId)}&v=3`;
      const xml = await this.transport(url);
      const document = parse(xml);
      const response = obj(document.FlexStatementResponse);
      const code = String(response.ErrorCode ?? "");
      if (code) {
        if (!retryCodes.has(code)) throw new Error(`Flex error ${code}`);
      } else if (response.Status === "Success" && response.ReferenceCode) {
        reference = String(response.ReferenceCode);
      } else if (document.FlexQueryResponse) {
        return xml;
      } else {
        throw new Error("Unexpected Flex response");
      }
      await this.pause(Math.min(30_000, 1000 * 2 ** attempt));
    }
    throw new Error("Flex statement was not ready");
  }
}

export function flexServiceFromEnv(transport?: FlexTransport, pause?: (ms: number) => Promise<void>): FlexService {
  const token = process.env.FLEX_TOKEN;
  const queryId = process.env.FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error("FLEX_TOKEN and FLEX_QUERY_ID are required");
  return new FlexService(token, queryId, transport, pause);
}

export interface FlexRaw {
  positions: Record<string, unknown>[];
  trades: { row: Record<string, unknown>; rates: Record<string, unknown>[] }[];
  nav: Record<string, unknown>[];
  /** Live-shape extras. Empty or undefined when the statement uses the older shape. */
  cash: Record<string, unknown>[];
  rates: Record<string, unknown>[];
  navSummary?: Record<string, unknown>;
  /** Every ChangeInNAV row that carries values: nested dated rows, per-day breakout rows and the period summary. */
  navRows: Record<string, unknown>[];
  /** NAV rows with the dates and conversion rates of their own statement. */
  navEntries: { row: Record<string, unknown>; fromDate?: string; toDate?: string; rates: Record<string, unknown>[]; dailyStatement: boolean }[];
  fromDate?: string;
  toDate?: string;
}

const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value : value ? [value] : []).map(obj);
/** Rows sit either directly under the statement or inside a wrapper element, depending on the query. */
function rows(statement: Record<string, unknown>, wrapper: string, item: string): Record<string, unknown>[] {
  return [...list(statement[item]), ...list(obj(statement[wrapper])[item])];
}

export function parseFlexStatement(xml: string): FlexRaw {
  const root = obj(parse(xml).FlexQueryResponse);
  const statements = list(obj(root.FlexStatements).FlexStatement);
  const statement = [...statements].sort((a, b) => String(a.toDate ?? "").localeCompare(String(b.toDate ?? ""))).at(-1) ?? {};
  if (!Object.keys(statement).length) throw new Error("Flex statement missing");
  // ChangeInNAV is one element with attributes in the live shape, a wrapper of dated rows in the older one,
  // and a list of per-day elements when the query has "Breakout by Day" on.
  const nodes = list(statement.ChangeInNAV);
  const nested = nodes.flatMap((node) => list(node.ChangeInNAV));
  const flat = nodes.filter((node) => !("ChangeInNAV" in node) && Object.keys(node).length);
  const dated = (row: Record<string, unknown>) => String(row.reportDate ?? row.toDate ?? "");
  const byDate = [...flat].sort((a, b) => dated(a).localeCompare(dated(b)));
  const deposit = (row: Record<string, unknown>) => Number(row.depositsWithdrawals ?? row.deposits ?? 0) || 0;
  const navSummary = nested.length ? undefined
    : flat.length === 1 ? flat[0]
    : flat.length > 1 ? { startingValue: byDate[0].startingValue, endingValue: byDate.at(-1)!.endingValue, depositsWithdrawals: String(byDate.reduce((sum, row) => sum + deposit(row), 0)) }
    : undefined;
  const rowDate = (row: Record<string, unknown>, key: "fromDate" | "toDate") => row[key] === undefined ? undefined : String(row[key]);
  const navEntries = statements.flatMap((item) => {
    const itemNodes = list(item.ChangeInNAV);
    const itemRows = [...itemNodes.flatMap((node) => list(node.ChangeInNAV)), ...itemNodes.filter((node) => !("ChangeInNAV" in node) && Object.keys(node).length)];
    const rates = rows(item, "ConversionRates", "ConversionRate");
    return itemRows.map((row) => ({ row, fromDate: rowDate(item, "fromDate"), toDate: rowDate(item, "toDate"), rates, dailyStatement: statements.length > 1 }));
  });
  const earliest = [...statements].sort((a, b) => String(a.fromDate ?? a.toDate ?? "").localeCompare(String(b.fromDate ?? b.toDate ?? "")))[0];
  return {
    positions: rows(statement, "OpenPositions", "OpenPosition"),
    trades: statements.flatMap((item) => rows(item, "Trades", "Trade").map((row) => ({ row, rates: rows(item, "ConversionRates", "ConversionRate") }))),
    nav: nested,
    cash: rows(statement, "CashReport", "CashReportCurrency"),
    rates: rows(statement, "ConversionRates", "ConversionRate"),
    navSummary,
    navRows: [...nested, ...flat],
    navEntries,
    fromDate: statements.length > 1 ? rowDate(earliest, "fromDate") ?? rowDate(earliest, "toDate") : statement.fromDate === undefined ? (flat.length > 1 ? rowDate(byDate[0], "fromDate") ?? dated(byDate[0]) : undefined) : String(statement.fromDate),
    toDate: statement.toDate === undefined ? (flat.length > 1 ? dated(byDate.at(-1)!) || undefined : undefined) : String(statement.toDate),
  };
}

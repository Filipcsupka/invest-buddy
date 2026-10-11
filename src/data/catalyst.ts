import { freshnessDays, stripMarkup, type EvidenceRef } from "./evidence";

/** Fact written by collect from stored SEC 8-K text, read by reconcile. */
export const CATALYST_FACT_KEY = "catalyst_8k";
export const CATALYST_WINDOW_DAYS = freshnessDays.productCatalyst;
/** Collect runs after the session it describes; a "none found" fact may be dated a few days after the scoring date. */
export const CATALYST_FACT_LEAD_DAYS = 3;
export const CATALYST_FIELD_CLAIM = "fundamentals.productCatalyst";
/** 8-K items that can carry a product catalyst. Every one still needs product wording in its own text. */
export const CATALYST_ITEMS = ["1.01", "7.01", "8.01", "2.02"] as const;

export interface CatalystDoc { url: string; docType: string; publishedAt: string; items: string; body: string; displayAllowed: boolean; id?: number }
/** Value of the catalyst_8k fact. `present: true` carries the matched filing; `present: false` says how many 8-K texts were read. */
export interface CatalystFactValue { present: boolean; checked: number; item?: string; url?: string; docType?: string; publishedAt?: string; quote?: string }
export interface CatalystResult { value: boolean | null; reason: string; refs: EvidenceRef[] }

const PRODUCT: RegExp[] = [
  /\b(?:launch(?:es|ed|ing)?|unveil(?:s|ed|ing)?|introduc(?:es|ed|ing))\b/i,
  /\bnew (?:product|platform|chip|service|offering|solution|model|drug|therapy|device)s?\b/i,
  /\b(?:partnership|collaboration)\b/i,
  /\bFDA (?:approval|clearance|approved|cleared)\b|\bapproved by the (?:U\.S\. )?(?:FDA|Food and Drug Administration)\b/i,
  /\b(?:awarded|award of|wins?|won)\b[^.]{0,80}\bcontracts?\b|\bcontract award\b/i,
];
/** Item 1.01 is also used for loans, notes and credit lines; only a commercial agreement counts. */
const COMMERCIAL_AGREEMENT = /\b(?:supply|license|licensing|distribution|development|co-?development|offtake|collaboration|partnership|purchase)\s+agreement\b/i;
const LIMITED_PARTNERSHIP = /limited partnership|\bL\.?P\.?\b/;
/** Forward-looking and risk language names "new products" as a possibility, not an event. */
const RISK = /\b(?:forward-looking|risks?|uncertaint(?:y|ies)|could|may|might|no assurance|cannot assure|there can be no|subject to|failure to)\b/i;
const MAX_QUOTE = 300;

const HEADING = /(?<!\b(?:this|under|in|to|of|and|with|by|see)\s)\bItem\s+(\d{1,2}\.\d{2})\.?\s+(?=[A-Z])/g;

/** Text of the document the way the stored-text verifier reads it: markup removed, whitespace collapsed. */
export const plainText = (body: string): string => stripMarkup(body).replace(/\s+/g, " ").trim();

/** Item sections of a primary 8-K document. Empty when no heading is found. */
function sections(text: string): { item: string; text: string }[] {
  const marks = [...text.matchAll(HEADING)].map((m) => ({ item: m[1], at: m.index!, from: m.index! + m[0].length }));
  return marks.map((mark, i) => ({ item: mark.item, text: text.slice(mark.from, marks[i + 1]?.at ?? text.length) }));
}

/** First sentence with product wording outside risk language. The quote is a verbatim piece of `text`. */
function firstProductSentence(text: string, item: string): string | null {
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z“"(])/)) {
    if (RISK.test(sentence) || /\bthe information (?:in|furnished)|shall not be deemed/i.test(sentence)) continue;
    const hit = PRODUCT.map((re) => re.exec(sentence)).find((m): m is RegExpExecArray => m !== null && !(/partnership/i.test(m[0]) && LIMITED_PARTNERSHIP.test(sentence)));
    const found = (item === "1.01" ? COMMERCIAL_AGREEMENT.exec(sentence) : null) ?? hit;
    if (!found) continue;
    const at = found.index;
    if (sentence.length <= MAX_QUOTE) return sentence;
    const start = Math.max(0, at - 100);
    return sentence.slice(start, start + MAX_QUOTE).trim();
  }
  return null;
}

const itemList = (items: string): string[] => items.split(/[,\s]+/).filter(Boolean);
const dayOf = (iso: string) => iso.slice(0, 10);
const ageDays = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${dayOf(from)}T00:00:00Z`)) / 86_400_000;
const isEightK = (docType: string) => /^8-K(?:\/A)?(?:\s+EX-99\.\d)?$/i.test(docType);

/**
 * Deterministic catalyst from stored 8-K documents and exhibits (edgar, display allowed) published in the last 90 days.
 * A filing qualifies through item 1.01 (commercial agreement), 2.02, 7.01 or 8.01 when a sentence outside risk language names a launch,
 * a new product or platform, a partnership, an FDA approval or a contract award. The newest qualifying filing supplies the quote.
 * Returns the fact value, or null when no 8-K text was read (unknown: the rule does not apply).
 */
export function catalystFromDocuments(docs: CatalystDoc[], asOf: string, windowDays = CATALYST_WINDOW_DAYS): CatalystFactValue | null {
  const read = docs.filter((doc) => doc.displayAllowed && isEightK(doc.docType) && doc.body.trim() !== "" && doc.url.startsWith("https://")
    && ageDays(doc.publishedAt, asOf) >= 0 && ageDays(doc.publishedAt, asOf) <= windowDays);
  if (!read.length) return null;
  for (const doc of [...read].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url))) {
    const items = itemList(doc.items).filter((item) => (CATALYST_ITEMS as readonly string[]).includes(item));
    if (!items.length) continue;
    const text = plainText(doc.body);
    const primary = /^8-K(?:\/A)?$/i.test(doc.docType);
    // An exhibit has no item headings: it belongs to the filing's first qualifying item, in the order of CATALYST_ITEMS.
    const parts = primary && sections(text).length ? sections(text).filter((s) => items.includes(s.item)) : [{ item: CATALYST_ITEMS.find((i) => items.includes(i))!, text }];
    for (const part of parts) {
      const quote = firstProductSentence(part.text, part.item);
      if (quote) return { present: true, checked: read.length, item: part.item, url: doc.url, docType: doc.docType, publishedAt: dayOf(doc.publishedAt), quote };
    }
  }
  return { present: false, checked: read.length };
}

const dayShift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Reconcile side: turns the stored catalyst_8k fact into a catalyst result. null when there is no usable fact (the extractor stands).
 * A fact is usable when it is not older than the 90-day window and does not point past the scoring date.
 */
export function catalystFromFact(fact: { asOf: string; value: unknown } | null, asOf: string): CatalystResult | null {
  const v = fact?.value as Partial<CatalystFactValue> | null | undefined;
  if (!fact || !v || typeof v.present !== "boolean") return null;
  if (v.present) {
    if (!v.url?.startsWith("https://") || !v.publishedAt || !v.quote || !v.item) return null;
    const age = ageDays(v.publishedAt, asOf);
    if (!Number.isFinite(age) || age < 0 || age > CATALYST_WINDOW_DAYS) return null;
    return { value: true, reason: `SEC 8-K item ${v.item} filed ${v.publishedAt} names a product, partnership or contract event`,
      refs: [{ claim: CATALYST_FIELD_CLAIM, url: v.url, publishedAt: v.publishedAt, fiscalPeriod: `SEC 8-K item ${v.item}`, quote: v.quote }] };
  }
  if (fact.asOf > dayShift(asOf, CATALYST_FACT_LEAD_DAYS) || fact.asOf <= dayShift(asOf, -CATALYST_WINDOW_DAYS)) return null;
  return { value: false, reason: `${v.checked ?? 0} SEC 8-K text(s) read in the last ${CATALYST_WINDOW_DAYS} days; none names a product, partnership or contract event outside risk language`, refs: [] };
}

type Queryable = { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
/** Newest fact for the date, a qualifying one first: a filing inside the window stays valid while a later "none found" row exists for another day. */
export async function loadCatalyst(pool: Queryable, symbol: string, asOf: string): Promise<CatalystResult | null> {
  const { rows } = await pool.query(`SELECT as_of::text AS as_of, value FROM collected_facts
    WHERE symbol=$1 AND fact_key=$2 AND as_of <= $3::date + $5::int AND as_of > $3::date - $4::int
    ORDER BY (value->>'present')='true' DESC, as_of DESC LIMIT 5`, [symbol, CATALYST_FACT_KEY, asOf, CATALYST_WINDOW_DAYS, CATALYST_FACT_LEAD_DAYS]);
  for (const row of rows) { const result = catalystFromFact({ asOf: String(row.as_of), value: row.value }, asOf); if (result) return result; }
  return null;
}

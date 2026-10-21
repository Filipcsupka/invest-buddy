import { createHash } from "node:crypto";

export type CardCall = "START" | "ADD" | "WATCH" | "HOLD" | "REDUCE" | "STOP_ADD" | "OTHER";
export type CardSections = {
  whatHappened: string[]; whyItMatters: string[]; risk: string[];
  setup: { company?: string; entry?: string; catalyst?: string };
  numbers: { label: string; value: string }[];
  plan: { now?: string; start?: string; graduate?: string; stopAdding?: string; opportunityCost?: string; invalidation?: string; other: string[] };
  extra: Record<string, string[]>;
};
export type AiCard = {
  symbol: string; exchangeHint: string | null; callText: string; call: CardCall;
  amountText: string | null; amountMinEur: number | null; amountMaxEur: number | null;
  cardDate: string | null; tag: string | null; summary: string; sections: CardSections;
  evidenceNames: string[]; priceText: string | null; priceValue: number | null; priceCurrency: string | null;
  rawText: string; dedupeKey: string; children: AiCard[];
};

const header = /^([A-Z][A-Z0-9.]{1,9})\s*[—–-]\s*(.+?)(?:\s*[—–-]\s*(€\s*[\d,.]+(?:\s*[–-]\s*[\d,.]+)?))?\s*$/;
const dateLine = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*\|\s*(.*))?$/;
const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const sectionNames: Record<string, string> = { "what happened": "whatHappened", "why it matters": "whyItMatters", setup: "setup", numbers: "numbers", plan: "plan", evidence: "evidence", "other material portfolio developments": "developments" };

export function normalizeCall(value: string): CardCall {
  const upper = value.toUpperCase();
  if (/REDUCE/.test(upper)) return "REDUCE";
  if (/STOP ADDING|NO ADD/.test(upper)) return "STOP_ADD";
  if (/\bSTART\b/.test(upper)) return "START";
  if (/\bADD\b/.test(upper)) return "ADD";
  if (/\bWATCH\b/.test(upper)) return "WATCH";
  if (/\bHOLD\b/.test(upper)) return "HOLD";
  return "OTHER";
}

function parseDate(line: string) {
  const match = dateLine.exec(line.trim());
  if (!match || !months[match[2].toLowerCase()]) return null;
  const month = months[match[2].toLowerCase()];
  const iso = `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : { date: iso, tag: match[4]?.trim() || null };
}

function parseAmount(value: string | null) {
  if (!value) return [null, null] as const;
  const nums = [...value.matchAll(/[\d,.]+/g)].map((m) => Number(m[0].replace(",", ".")));
  return [nums[0] ?? null, nums[1] ?? nums[0] ?? null] as const;
}

function parsePrice(text: string) {
  const pence = /\b(\d+(?:\.\d+)?)p\b/i.exec(text);
  if (pence) return { priceText: pence[0], priceValue: Number(pence[1]), priceCurrency: "GBX" };
  const money = /\b(CHF|USD|EUR|GBP)\s*~?\s*(\d+(?:\.\d+)?)/i.exec(text);
  return money ? { priceText: money[0], priceValue: Number(money[2]), priceCurrency: money[1].toUpperCase() } : { priceText: null, priceValue: null, priceCurrency: null };
}

function blankSections(): CardSections {
  return { whatHappened: [], whyItMatters: [], risk: [], setup: {}, numbers: [], plan: { other: [] }, extra: {} };
}

function parseOne(rawText: string, inheritedDate?: string | null): AiCard | null {
  const rawLines = rawText.split(/\r?\n/);
  const lines = rawLines.map((line) => line.replace(/^Growth V2 Market Alpha Scan(?=[A-Z][A-Z0-9.]{1,9}\s*[—–-])/, ""));
  const offsets = [0];
  for (const ending of rawText.matchAll(/\r?\n/g)) offsets.push(ending.index + ending[0].length);
  const first = lines.findIndex((line) => header.test(line.trim()));
  if (first < 0) return null;
  const match = header.exec(lines[first].trim())!;
  const symbol = match[1];
  const callText = match[2].trim();
  const inlineAmount = !match[3] ? /\s+(€\s*[\d,.]+(?:\s*[–-]\s*[\d,.]+)?)$/.exec(callText) : null;
  const finalCallText = inlineAmount ? callText.slice(0, inlineAmount.index).trim() : callText;
  const amountText = (match[3] ?? inlineAmount?.[1])?.replace(/\s+/g, "") ?? null;
  const [amountMinEur, amountMaxEur] = parseAmount(amountText);
  const dated = parseDate(lines[first + 1] ?? "");
  const start = first + (dated ? 2 : 1);
  const sections = blankSections();
  const summary: string[] = [];
  const evidenceNames: string[] = [];
  const children: AiCard[] = [];
  let current = "summary";
  let childStart = -1;
  const flushChild = (end: number) => {
    if (childStart < 0) return;
    const child = parseOne(rawText.slice(offsets[childStart], offsets[end] ?? rawText.length), dated?.date ?? inheritedDate);
    if (child) children.push(child);
    childStart = -1;
  };
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (current === "developments" && header.test(line) && normalizeCall(header.exec(line)![2]) !== "OTHER") { flushChild(i); childStart = i; continue; }
    if (childStart >= 0 && line.toLowerCase() === "evidence") flushChild(i);
    if (childStart >= 0) continue;
    const known = sectionNames[line.toLowerCase()];
    if (known) { current = known; continue; }
    if (current !== "numbers" && current !== "plan" && current !== "evidence" && !Object.hasOwn(sections.extra, current) && /^[A-Z][A-Za-z ]{2,40}$/.test(line)) { current = line; sections.extra[current] = []; continue; }
    if (current === "developments") { (sections.extra.developments ??= []).push(line); continue; }
    if (current === "summary") { summary.push(line); continue; }
    if (current === "evidence") { evidenceNames.push(...line.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean)); continue; }
    const value = line.replace(/^[-•]\s*/, "");
    if (current === "whatHappened") sections.whatHappened.push(value);
    else if (current === "whyItMatters") {
      if (/^(Important(?: risk)?|Risk):/i.test(value)) sections.risk.push(value);
      else sections.whyItMatters.push(value);
    } else if (current === "setup") {
      const m = /^(Company|Entry|Catalyst):\s*(.*)$/i.exec(value);
      if (m) sections.setup[m[1].toLowerCase() as keyof typeof sections.setup] = m[2];
      else (sections.extra.setup ??= []).push(value);
    } else if (current === "numbers") {
      const m = /^([^:\t]+):\s*(.+)$/.exec(value) ?? /^(.+?)(?:\s{2,}|\t+)(.+)$/.exec(value);
      if (m && m[2]) sections.numbers.push({ label: m[1].trim(), value: m[2].trim() });
      else (sections.extra.numbers ??= []).push(value);
    } else if (current === "plan") {
      const m = /^(Now|START(?:\s+€[^:]+)?|Graduate (?:toward|to)(?:\s+€[^:]+)?|Stop adding|Opportunity cost|Invalidation):\s*(.*)$/i.exec(value);
      if (!m) sections.plan.other.push(value);
      else {
        const key = m[1].toLowerCase().startsWith("graduate") ? "graduate" : m[1].toLowerCase().startsWith("start") ? "start" : ({ now: "now", "stop adding": "stopAdding", "opportunity cost": "opportunityCost", invalidation: "invalidation" } as const)[m[1].toLowerCase() as "now"];
        if (key) sections.plan[key] = m[2]; else sections.plan.other.push(value);
      }
    } else (sections.extra[current] ??= []).push(value);
  }
  flushChild(lines.length);
  const price = parsePrice(rawText);
  const cardDate = dated?.date ?? inheritedDate ?? null;
  const call = normalizeCall(finalCallText);
  return { symbol, exchangeHint: null, callText: finalCallText, call, amountText, amountMinEur, amountMaxEur, cardDate, tag: dated?.tag ?? null, summary: summary.join(" "), sections, evidenceNames, ...price, rawText, dedupeKey: createHash("sha256").update(`${symbol}|${cardDate ?? ""}|${call}|${rawText}`).digest("hex"), children };
}

/** Main card rawText segments concatenate to the exact pasted blob. Child rawText is also retained separately. */
export function parseAiCards(raw: string): AiCard[] {
  const starts: number[] = [];
  const rx = /(?:^|\r?\n)(?:Growth V2 Market Alpha Scan)?([A-Z][A-Z0-9.]{1,9}\s*[—–-]\s*[^\r\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(raw))) {
    const at = match.index + (match[0].startsWith("\r\n") ? 2 : match[0].startsWith("\n") ? 1 : 0);
    const parsedHeader = header.exec(match[1].trim());
    if (!parsedHeader || normalizeCall(parsedHeader[2]) === "OTHER") continue;
    const previous = starts.at(-1) ?? 0;
    const context = raw.slice(previous, at);
    const developmentAt = context.lastIndexOf("Other material portfolio developments");
    const evidenceAt = context.lastIndexOf("\nEvidence");
    if (developmentAt >= 0 && developmentAt > evidenceAt) continue;
    starts.push(at);
  }
  if (!starts.length) return [];
  return starts.map((at, index) => parseOne(raw.slice(index ? at : 0, starts[index + 1] ?? raw.length))).filter((card): card is AiCard => !!card);
}

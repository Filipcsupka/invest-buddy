import { createHash } from "node:crypto";

export interface CollectedDocument {
  source: string;
  symbol: string | null;
  docType: string;
  url: string;
  publishedAt: string;
  body: string;
  meta: Record<string, unknown>;
  contentHash: string;
}

/** Upper bound on characters scanned. The stored body is capped far below this, it only bounds CPU and memory. */
const MAX_INPUT_CHARS = 16 * 1024 * 1024;

/** Drops `<tag ...>...</tag>` blocks in one pass. An unclosed block drops the rest, as a browser would treat it as script. */
function stripBlocks(input: string, tag: "script" | "style"): string {
  const open = new RegExp(`<${tag}\\b`, "gi"), close = new RegExp(`</${tag}\\b`, "gi");
  const parts: string[] = [];
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const start = open.exec(input);
    if (!start) { parts.push(input.slice(pos)); return parts.join(""); }
    parts.push(input.slice(pos, start.index), " ");
    const gt = input.indexOf(">", start.index + start[0].length);
    if (gt < 0) return parts.join("");
    close.lastIndex = gt + 1;
    const end = close.exec(input);
    if (!end) return parts.join("");
    const endGt = input.indexOf(">", end.index + end[0].length);
    if (endGt < 0) return parts.join("");
    pos = endGt + 1;
  }
}

/** Replaces markup tags with a space. Only `<letter`, `</letter` and `<!` start a tag, so "<$5M and >3" stays text. Linear time. */
function stripTags(input: string): string {
  const parts: string[] = [];
  let pos = 0, i = input.indexOf("<");
  while (i >= 0) {
    const next = input.charCodeAt(i + 1) === 47 ? input[i + 2] : input[i + 1];
    if (next !== undefined && /[a-zA-Z!]/.test(next)) {
      const gt = input.indexOf(">", i);
      if (gt < 0) break;
      parts.push(input.slice(pos, i), " ");
      pos = gt + 1;
      i = input.indexOf("<", pos);
    } else i = input.indexOf("<", i + 1);
  }
  parts.push(input.slice(pos));
  return parts.join("");
}

const codePoint = (value: number) => value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : " ";

export function plainText(input: string, maxBytes = 204800): string {
  const bounded = input.length > MAX_INPUT_CHARS ? input.slice(0, MAX_INPUT_CHARS) : input;
  // &amp; is decoded last so "&amp;lt;" ends as the text "&lt;", not as "<".
  const text = stripTags(stripBlocks(stripBlocks(bounded, "script"), "style"))
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d{1,8});/g, (_, n: string) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => codePoint(parseInt(n, 16)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")
    .split("\u0000").join(" ")
    .replace(/\s+/g, " ").trim();
  let bytes = 0, end = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return text.slice(0, end);
}

export function document(input: Omit<CollectedDocument, "contentHash">): CollectedDocument {
  const body = plainText(input.body);
  return { ...input, body, contentHash: createHash("sha256").update(body).digest("hex") };
}

/** Phase A collectors, selected one at a time by `collect --source`. */
export const LEGACY_SOURCES = ["edgar", "rss", "fred"] as const;
/** Phase A2 sources. Needs no key or account. `13f` is large and only runs when asked for. Not in the default run. */
export const EXTRA_SOURCES = ["frames", "getcurrent", "13f", "openfda", "clinicaltrials", "usaspending", "fed", "treasury", "bls", "vix", "gnews", "gdelt"] as const;
export type SourceName = (typeof LEGACY_SOURCES)[number] | (typeof EXTRA_SOURCES)[number];

/**
 * Text handling for the verifier. Page content is data: nothing here evaluates, executes or follows what a page says.
 */

const RAW_TEXT = new Set(["script", "style"]);
/** Elements whose content is not page text. */
const DROP = new Set(["noscript", "template", "iframe", "object", "embed", "svg", "canvas"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const BLOCK = new Set(["p", "div", "br", "li", "ul", "ol", "tr", "table", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "main", "aside", "nav", "figure", "figcaption", "dd", "dt", "dl", "hr", "td", "th"]);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  hellip: "…", minus: "−", shy: "", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", deg: "°", plusmn: "±", times: "×", middot: "·", bull: "•",
};
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try { return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; } catch { return ""; }
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`(?:^|[\\s"'/])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
}

/** Hidden by attribute or inline style. A stylesheet class can hide text too; that is not detectable here. */
function isHidden(attrs: string): boolean {
  if (/(?:^|[\s"'/])hidden(?=[\s=/>]|$)/i.test(attrs)) return true;
  if (/^\s*true\s*$/i.test(attr(attrs, "aria-hidden") ?? "")) return true;
  const style = attr(attrs, "style");
  return !!style && /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|(?:font-size|opacity|max-height|height|width)\s*:\s*0(?![.\d%a-z])|text-indent\s*:\s*-\d{3,}/i.test(style);
}

/** HTML to plain text. Drops script, style, comments, hidden elements and their content; block elements break lines. Not a validating parser. */
export function htmlToText(html: string): string {
  const out: string[] = [];
  const stack: { name: string; hidden: boolean }[] = [];
  let hiddenDepth = 0;
  let i = 0;
  const n = html.length;
  const text = (chunk: string) => { if (!hiddenDepth) out.push(decodeEntities(chunk)); };
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { text(html.slice(i)); break; }
    if (lt > i) text(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) { const end = html.indexOf("-->", lt + 4); i = end < 0 ? n : end + 3; continue; }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      if (html[lt + 1] === "!" || html[lt + 1] === "?") { const end = html.indexOf(">", lt); i = end < 0 ? n : end + 1; } else { text("<"); i = lt + 1; }
      continue;
    }
    i = lt + m[0].length;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (closing) {
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].name !== name) continue;
        for (const dropped of stack.splice(s)) if (dropped.hidden) hiddenDepth--;
        break;
      }
      if (BLOCK.has(name) && !hiddenDepth) out.push("\n");
      continue;
    }
    if (RAW_TEXT.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, i);
      if (end < 0) { i = n; } else { const close = html.indexOf(">", end); i = close < 0 ? n : close + 1; }
      continue;
    }
    if (VOID.has(name)) { if (name === "br" && !hiddenDepth) out.push("\n"); continue; }
    if (m[3].trimEnd().endsWith("/")) continue;
    const hidden = DROP.has(name) || isHidden(m[3]);
    stack.push({ name, hidden });
    if (hidden) hiddenDepth++;
    else if (BLOCK.has(name)) out.push("\n");
  }
  return out.join("").replace(/[ \t\f\v  -  　]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Quotes, dashes, ellipsis and spaces to one form; zero-width characters removed. Case is kept. */
export function normalizeText(value: string): string {
  return value.normalize("NFKC")
    .replace(/[​-‍⁠﻿­]/g, "")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐‑‒–—―−﹘﹣－]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QuoteMatch { match: "exact" | "fuzzy"; text: string }

/** Quotes of at least this many characters may differ from the page by up to FUZZY_MAX_EDITS characters. */
export const FUZZY_MIN_CHARS = 80;
export const FUZZY_MAX_EDITS = 3;

const digitRuns = (text: string) => text.match(/\d+/g)?.join(" ") ?? "";

/** Smallest edit distance between `needle` and any substring of `hay`, with the end of that substring. Stops early above `max`. */
function bestSubstringDistance(needle: string, hay: string, max: number): { distance: number; end: number } | null {
  const m = needle.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let best: { distance: number; end: number } | null = null;
  for (let j = 1; j <= hay.length; j++) {
    const cur = new Array<number>(m + 1);
    cur[0] = 0;
    for (let i = 1; i <= m; i++) {
      cur[i] = Math.min(prev[i - 1] + (needle[i - 1] === hay[j - 1] ? 0 : 1), prev[i] + 1, cur[i - 1] + 1);
    }
    if (cur[m] <= max && (!best || cur[m] < best.distance)) best = { distance: cur[m], end: j };
    prev = cur;
  }
  return best;
}

/**
 * Exact match after normalisation (NFKC, quotes and dashes, whitespace; case is kept), else a fuzzy match for quotes of
 * 80 or more characters: at most 3 differing characters, and the digits must be identical, so a changed figure never verifies.
 * Fuzzy search splits the quote in 4 pieces; with at most 3 edits one piece must appear unchanged, which anchors the window.
 */
export function findQuote(pageText: string, quote: string, maxChars = 600): QuoteMatch | null {
  const page = normalizeText(pageText);
  const wanted = normalizeText(quote);
  if (!wanted) return null;
  const at = page.indexOf(wanted);
  if (at >= 0) return { match: "exact", text: page.slice(at, at + wanted.length).slice(0, maxChars) };
  if (wanted.length < FUZZY_MIN_CHARS) return null;
  const size = Math.floor(wanted.length / (FUZZY_MAX_EDITS + 1));
  const seen = new Set<number>();
  let best: { distance: number; start: number; end: number } | null = null;
  for (let piece = 0; piece <= FUZZY_MAX_EDITS; piece++) {
    const offset = piece * size;
    const part = wanted.slice(offset, piece === FUZZY_MAX_EDITS ? undefined : offset + size);
    if (part.length < 8) continue;
    for (let from = page.indexOf(part); from >= 0; from = page.indexOf(part, from + 1)) {
      const start = Math.max(0, from - offset - FUZZY_MAX_EDITS);
      if (seen.has(start)) continue;
      seen.add(start);
      const window = page.slice(start, from - offset + wanted.length + FUZZY_MAX_EDITS);
      const hit = bestSubstringDistance(wanted, window, FUZZY_MAX_EDITS);
      if (!hit) continue;
      const reversed = [...window.slice(0, hit.end)].reverse().join("");
      const back = bestSubstringDistance([...wanted].reverse().join(""), reversed, hit.distance);
      const from0 = hit.end - (back ? back.end : wanted.length);
      const text = window.slice(Math.max(0, from0), hit.end);
      if (digitRuns(text) !== digitRuns(wanted)) continue;
      if (!best || hit.distance < best.distance) best = { distance: hit.distance, start: start + Math.max(0, from0), end: start + hit.end };
    }
  }
  if (!best) return null;
  return { match: "fuzzy", text: page.slice(best.start, best.end).slice(0, maxChars) };
}

const META_DATE_KEYS = ["article:published_time", "og:article:published_time", "datepublished", "pubdate", "publishdate", "publish-date", "publication_date", "date", "dc.date", "dc.date.issued", "dcterms.created", "parsely-pub-date", "sailthru.date", "citation_publication_date", "citation_date", "article.published"];

/** YYYY-MM-DD from an ISO-like or RFC date string, or null. */
export function toIsoDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  const time = iso ? Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : Date.parse(trimmed);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  if (date.getUTCFullYear() < 1990) return null;
  if (iso && date.toISOString().slice(0, 10) !== iso[0].slice(0, 10)) return null;
  return date.toISOString().slice(0, 10);
}

/** Publication date a page states about itself: meta tags, JSON-LD datePublished, then the first <time datetime>. */
export function extractPageDate(html: string): string | null {
  const wanted = new Set(META_DATE_KEYS);
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    if (wanted.has(key)) { const date = toIsoDate(attr(tag, "content")); if (date) return date; }
  }
  const ld = /"datePublished"\s*:\s*"([^"]+)"/i.exec(html);
  if (ld) { const date = toIsoDate(ld[1]); if (date) return date; }
  for (const tag of html.match(/<time\b[^>]*>/gi) ?? []) {
    const date = toIsoDate(attr(tag, "datetime"));
    if (date) return date;
  }
  return null;
}

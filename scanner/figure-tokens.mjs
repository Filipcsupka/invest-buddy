/** Parse prose figures without accepting a match inside a larger number or identifier. */
const FIGURE = /(?<![\p{L}\p{N}_.,])([-\u2212])?(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?!\d|[.,]\d)/gu;
const PROTECTED_TOKEN = /(?<![\p{L}\p{N}_])(?:Q[1-4]|[1-4]Q\d{2,4}|H[12]|(?:FY|CY)\d{2,4}|RSI\d*|[SE]?MA\d+|SPY)(?![\p{L}\p{N}_])/gu;

export function normalizeFigureText(text) {
  return String(text)
    .replace(/\b\d{1,3}(?:\.\d{3})+(?:,\d{1,2})\b/g, (value) => value.replaceAll(".", ""))
    .replace(/\b\d{1,3}(?:\.\d{3}){2,}\b/g, (value) => value.replaceAll(".", ""))
    .replace(/\b\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})\b/g, (value) => value.replaceAll(" ", ""))
    .replace(/\b\d{1,3}(?: \d{3}){2,}\b/g, (value) => value.replaceAll(" ", ""))
    .replace(/(?<=\d)[\u00a0\u202f\u2009'’](?=\d{3}(?!\d))/g, "")
    .replace(/(?<=\d),(?=\d{1,2}(?!\d))/g, ".")
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "");
}

export function figureValuesIn(text) {
  return [...normalizeFigureText(text).matchAll(FIGURE)].map((match) =>
    (match[1] ? -1 : 1) * Number(match[2]));
}

export function sameFigureValues(a, b) {
  const values = (text) => figureValuesIn(text).sort((x, y) => x - y);
  return JSON.stringify(values(a)) === JSON.stringify(values(b));
}

export function sameProtectedTokens(a, b) {
  const tokens = (text) => [...String(text).matchAll(PROTECTED_TOKEN)].map((match) => match[0]).sort();
  return JSON.stringify(tokens(a)) === JSON.stringify(tokens(b));
}

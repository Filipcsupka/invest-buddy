/** Minimal 5-field cron: lists, ranges, steps and `*`, with day-of-week 0 or 7 for Sunday. Evaluated in an IANA time zone. */

interface Fields { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }

function parseField(text: string, min: number, max: number, map: (n: number) => number = (n) => n): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad cron step in "${text}"`);
    let from = min, to = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      from = Number(a); to = b === undefined ? (stepText ? max : from) : Number(b);
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) throw new Error(`bad cron field "${text}"`);
    for (let n = from; n <= to; n += step) out.add(map(n));
  }
  return out;
}

export function parseCron(expression: string): Fields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron needs 5 fields: "${expression}"`);
  return {
    minute: parseField(parts[0], 0, 59), hour: parseField(parts[1], 0, 23),
    dom: parseField(parts[2], 1, 31), month: parseField(parts[3], 1, 12), dow: parseField(parts[4], 0, 7, (n) => n % 7),
    domAny: parts[2] === "*", dowAny: parts[4] === "*",
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); formatters.set(timeZone, f); }
  return f;
}

/** Local wall-clock parts of an instant as if they were UTC, in milliseconds. */
function wallClockMs(ms: number, timeZone: string): number {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map((part) => [part.type, Number(part.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The instant at which the local wall-clock time y-m-d h:mi occurs in the zone. */
function instantFromLocal(y: number, m: number, d: number, h: number, mi: number, timeZone: string): number {
  const asUtc = Date.UTC(y, m - 1, d, h, mi);
  let guess = asUtc - (wallClockMs(asUtc, timeZone) - asUtc);
  guess = asUtc - (wallClockMs(guess, timeZone) - guess);
  return guess;
}

/** The latest scheduled run at or before `before`, looking back up to `lookbackDays`, or null. */
export function lastScheduledAt(expression: string, timeZone: string, before: Date, lookbackDays = 400): Date | null {
  const f = parseCron(expression);
  const minutes = [...f.minute].sort((a, b) => b - a);
  const hours = [...f.hour].sort((a, b) => b - a);
  const local = new Date(wallClockMs(before.getTime(), timeZone));
  for (let back = 0; back <= lookbackDays; back++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back));
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    if (!f.month.has(m)) continue;
    // Standard cron: when both day fields are restricted, either may match.
    const domOk = f.dom.has(d), dowOk = f.dow.has(day.getUTCDay());
    if (!(f.domAny || f.dowAny ? domOk && dowOk : domOk || dowOk)) continue;
    for (const h of hours) for (const mi of minutes) {
      const at = instantFromLocal(y, m, d, h, mi, timeZone);
      if (at <= before.getTime()) return new Date(at);
    }
  }
  return null;
}

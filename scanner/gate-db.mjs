import { CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY, previousSession } from "./trading-calendar.mjs";
/** Scanner pods use the protected web endpoint so database credentials stay in the web and job pods. */
/** The scheduled detect/extract/judge chain runs at 06:10-08:35 UTC, before the US close. Keep an older pending gate on its original market date. */
const iso = (d) => d.toISOString().slice(0, 10);
const lastSunday = (year, month) => { const d = new Date(Date.UTC(year, month + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return iso(d); };
/** Central European summer time runs from the last Sunday of March to the last Sunday of October. */
export const isEuropeSummerTime = (date) => { const year = Number(date.slice(0, 4)); return date >= lastSunday(year, 2) && date < lastSunday(year, 9); };

/**
 * The market session a gate belongs to. Detect runs at 01:35 Bratislava time and the gate is dated by the UTC day of that run. In summer time the run
 * is 23:35 UTC, so the gate date is still the session day itself; in winter it is 00:35 UTC, so the gate date is the day after. Taking the previous
 * session in both seasons made the judge read the scores of the session before the last one for the whole summer.
 */
export function gateTradingDay(gateDate) {
  const local = new Date(`${gateDate}T00:00:00Z`);
  if (isEuropeSummerTime(gateDate)) local.setUTCDate(local.getUTCDate() + 1);
  const localDate = iso(local);
  if (localDate > CALENDAR_FIRST_DAY && localDate <= CALENDAR_LAST_DAY) return previousSession(localDate);
  const day = new Date(`${localDate}T00:00:00Z`);
  do { day.setUTCDate(day.getUTCDate() - 1); } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return iso(day);
}

export async function readGate(baseUrl, token, stage, date = null) {
  const response = await fetch(`${baseUrl}/api/ingest/gate?${new URLSearchParams({ stage, ...(date ? { date } : {}) })}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`gate ${stage} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const gate = await response.json();
  if (!Array.isArray(gate.symbols) || !/^\d{4}-\d{2}-\d{2}$/.test(gate.asOf) || (date && gate.asOf !== date) || !Number.isInteger(gate.revision)) throw new Error("invalid database gate");
  return gate;
}

export async function consumeGate(baseUrl, token, stage, date, revision) {
  const response = await fetch(`${baseUrl}/api/ingest/gate`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ stage, date, revision }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`gate ${stage} completion HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

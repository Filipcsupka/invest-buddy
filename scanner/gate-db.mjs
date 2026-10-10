import { CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY, previousSession } from "./trading-calendar.mjs";
/** Scanner pods use the protected web endpoint so database credentials stay in the web and job pods. */
/** The scheduled detect/extract/judge chain runs at 06:10-08:35 UTC, before the US close. Keep an older pending gate on its original market date. */
export function gateTradingDay(gateDate) {
  if (gateDate > CALENDAR_FIRST_DAY && gateDate <= CALENDAR_LAST_DAY) return previousSession(gateDate);
  const day = new Date(`${gateDate}T00:00:00Z`);
  do { day.setUTCDate(day.getUTCDate() - 1); } while (day.getUTCDay() === 0 || day.getUTCDay() === 6);
  return day.toISOString().slice(0, 10);
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

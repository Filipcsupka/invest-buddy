/** Scanner pods use the protected web endpoint so database credentials stay in the web and job pods. */
export async function readGate(baseUrl, token, stage, date = new Date().toISOString().slice(0, 10)) {
  const response = await fetch(`${baseUrl}/api/ingest/gate?${new URLSearchParams({ stage, date })}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`gate ${stage} HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const gate = await response.json();
  if (!Array.isArray(gate.symbols) || gate.asOf !== date || !Number.isInteger(gate.revision)) throw new Error("invalid database gate");
  return gate;
}

export async function consumeGate(baseUrl, token, stage, date, revision) {
  const response = await fetch(`${baseUrl}/api/ingest/gate`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ stage, date, revision }), signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`gate ${stage} completion HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

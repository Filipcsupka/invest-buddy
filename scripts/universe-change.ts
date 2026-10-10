import pg from "pg";

const lists = ["core", "extended", "discovery", "benchmark"] as const;
type UniverseList = typeof lists[number];
type Change = { action: "add" | "remove"; ticker: string; date: string; reason: string; actor: string;
  name?: string; sector?: string; list?: UniverseList; tier?: number | null; criteriaVersion?: string };

function validDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseChange(args: string[]): Change {
  const [action, rawTicker, ...rest] = args;
  const flags = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith("--") || !rest[i + 1] || flags.has(rest[i])) throw new Error("Invalid universe-change arguments");
    flags.set(rest[i], rest[i + 1]);
  }
  const allowed = new Set(["--date", "--reason", "--actor", "--name", "--sector", "--list", "--tier", "--criteria-version"]);
  if ([...flags.keys()].some((key) => !allowed.has(key))) throw new Error("Unknown universe-change option");
  const ticker = rawTicker?.toUpperCase();
  const date = flags.get("--date") ?? new Date().toISOString().slice(0, 10);
  const reason = flags.get("--reason")?.trim();
  const actor = flags.get("--actor")?.trim();
  if ((action !== "add" && action !== "remove") || !ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || !validDate(date) || !reason || !actor) {
    throw new Error("Usage: universe-change add|remove TICKER --date YYYY-MM-DD --reason TEXT --actor NAME [--name NAME --sector SECTOR --list core|extended|discovery|benchmark --tier 1|2|3 --criteria-version VERSION]");
  }
  if (action === "remove") {
    if (["--name", "--sector", "--list", "--tier", "--criteria-version"].some((key) => flags.has(key))) throw new Error("Remove only accepts date, reason and actor");
    return { action, ticker, date, reason, actor };
  }
  const list = flags.get("--list") as UniverseList;
  const tierText = flags.get("--tier");
  const tier = tierText === undefined ? null : Number(tierText);
  const name = flags.get("--name")?.trim(), sector = flags.get("--sector")?.trim(), criteriaVersion = flags.get("--criteria-version")?.trim();
  if (!name || !sector || !lists.includes(list) || (tier !== null && ![1, 2, 3].includes(tier)) || !criteriaVersion) throw new Error("Add requires name, sector, list, valid tier and criteria-version");
  return { action, ticker, date, reason, actor, name, sector, list, tier, criteriaVersion };
}

export async function changeUniverse(db: Pick<pg.Pool, "connect">, change: Change): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`universe:${change.ticker}`]);
    const current = await client.query<{ id: string; valid_from: string }>(
      "SELECT id,valid_from::text FROM universe_membership WHERE ticker=$1 AND valid_to IS NULL FOR UPDATE", [change.ticker]);
    if (change.action === "remove") {
      const row = current.rows[0];
      if (!row) throw new Error(`${change.ticker} is not an active member`);
      if (change.date <= row.valid_from) throw new Error("Removal date must follow addition date");
      await client.query("UPDATE universe_membership SET valid_to=$2,removed_reason=$3,removed_by=$4 WHERE id=$1", [row.id, change.date, change.reason, change.actor]);
    } else {
      if (current.rows.length) throw new Error(`${change.ticker} is already an active member`);
      const prior = await client.query<{ valid_to: string }>("SELECT valid_to::text FROM universe_membership WHERE ticker=$1 ORDER BY valid_from DESC LIMIT 1", [change.ticker]);
      if (prior.rows[0] && change.date < prior.rows[0].valid_to) throw new Error("Addition overlaps prior membership");
      const source = change.list === "benchmark" ? "benchmark" : change.list === "discovery" ? "discovery" : change.list === "extended" ? "sample extension" : "guide";
      await client.query(`INSERT INTO instruments(ticker,name,sector,tier,source) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT(ticker) DO UPDATE SET name=EXCLUDED.name,sector=EXCLUDED.sector,tier=EXCLUDED.tier,source=EXCLUDED.source`,
      [change.ticker, change.name, change.sector, change.tier, source]);
      await client.query(`INSERT INTO universe_membership(ticker,list,tier,valid_from,reason,criteria_version,added_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [change.ticker, change.list, change.tier, change.date, change.reason, change.criteriaVersion, change.actor]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

if (/(?:^|[/\\])universe-change\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const change = parseChange(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  changeUniverse(db, change).then(() => process.stdout.write(`${change.action} ${change.ticker} ${change.date}\n`))
    .catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
}

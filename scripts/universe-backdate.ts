import pg from "pg";

/**
 * Moves the start date of one batch of active memberships a few days earlier, for example so names added after a scan
 * date are scored on that date. One batch is the rows with the same list, actor and start date. Dry run by default.
 * Writes only `valid_from` and an appended note in `reason`; it never ends, removes or inserts rows.
 */
export interface Backdate { list: string; addedBy: string; from: string; to: string; note: string; actor: string; apply: boolean }
export interface BackdateResult { rows: number; byExchange: Record<string, number>; withBarOnTo: number; applied: boolean }

const MAX_DAYS = 7;
const isDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseBackdate(args: string[]): Backdate {
  const flags = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") { apply = true; continue; }
    if (!args[i].startsWith("--") || args[i + 1] === undefined || flags.has(args[i])) throw new Error("Invalid universe-backdate arguments");
    flags.set(args[i], args[++i]);
  }
  const allowed = new Set(["--list", "--added-by", "--from", "--to", "--note", "--actor"]);
  if ([...flags.keys()].some((key) => !allowed.has(key))) throw new Error("Unknown universe-backdate option");
  const [list, addedBy, from, to, note, actor] = ["--list", "--added-by", "--from", "--to", "--note", "--actor"].map((key) => flags.get(key)?.trim());
  if (!list || !addedBy || !isDate(from) || !isDate(to) || !note || !actor) {
    throw new Error("Usage: universe-backdate --list LIST --added-by ACTOR --from YYYY-MM-DD --to YYYY-MM-DD --note TEXT --actor NAME [--apply]");
  }
  const days = (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${to}T00:00:00Z`)) / 86_400_000;
  if (days < 1 || days > MAX_DAYS) throw new Error(`--to must be 1 to ${MAX_DAYS} days before --from`);
  return { list, addedBy, from, to, note, actor, apply };
}

export async function backdateUniverse(db: Pick<pg.Pool, "connect">, change: Backdate): Promise<BackdateResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('universe:backdate'))");
    const batch = await client.query<{ id: string; ticker: string; exchange: string; bar: boolean }>(
      `SELECT m.id,m.ticker,m.exchange,EXISTS (SELECT 1 FROM daily_bars b WHERE b.ticker=m.ticker AND b.bar_date=$4::date) AS bar
       FROM universe_membership m WHERE m.valid_to IS NULL AND m.list=$1 AND m.added_by=$2 AND m.valid_from=$3::date ORDER BY m.ticker FOR UPDATE`,
      [change.list, change.addedBy, change.from, change.to]);
    const overlap = await client.query<{ ticker: string }>(
      `SELECT DISTINCT m.ticker FROM universe_membership m JOIN universe_membership o ON o.ticker=m.ticker AND o.id<>m.id
       WHERE m.id = ANY($1::bigint[]) AND o.valid_to > $2::date ORDER BY m.ticker`, [batch.rows.map((row) => row.id), change.to]);
    if (overlap.rows.length) throw new Error(`Backdate would overlap an earlier membership: ${overlap.rows.map((row) => row.ticker).join(", ")}`);
    const byExchange: Record<string, number> = {};
    for (const row of batch.rows) byExchange[row.exchange] = (byExchange[row.exchange] ?? 0) + 1;
    if (change.apply && batch.rows.length) {
      await client.query(`UPDATE universe_membership SET valid_from=$2::date,
          reason=reason || ' [valid_from ' || $3 || ' -> ' || $2 || ' by ' || $4 || ': ' || $5 || ']'
        WHERE id = ANY($1::bigint[])`, [batch.rows.map((row) => row.id), change.to, change.from, change.actor, change.note]);
    }
    await client.query(change.apply ? "COMMIT" : "ROLLBACK");
    return { rows: batch.rows.length, byExchange, withBarOnTo: batch.rows.filter((row) => row.bar).length, applied: change.apply && batch.rows.length > 0 };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

if (/(?:^|[/\\])universe-backdate\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const change = parseBackdate(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  backdateUniverse(db, change)
    .then((result) => process.stdout.write(`${result.applied ? "Backdated" : "Dry run, would backdate"} ${result.rows} ${change.list} rows by ${change.addedBy} from ${change.from} to ${change.to}; ${result.withBarOnTo} have a bar on ${change.to}; by exchange ${JSON.stringify(result.byExchange)}\n`))
    .catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
}

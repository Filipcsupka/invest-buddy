import { getPool, closePool } from "../src/db/pool";
import { findUserByEmail } from "../src/db/users";
import { setEntitlement } from "../src/db/entitlements";

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  const email = value("--email");
  const tier = value("--tier");
  const daysRaw = value("--days");
  if (!process.env.OWNER_RESEARCH_PASSWORD || !email || (tier !== "free" && tier !== "plus") || (daysRaw && (!/^\d+$/.test(daysRaw) || Number(daysRaw) < 1))) throw new Error("Owner password env, --email and --tier free|plus are required");
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL is required");
  const user = await findUserByEmail(db, email);
  if (!user) throw new Error("User not found");
  const endsAt = daysRaw ? new Date(Date.now() + Number(daysRaw) * 86_400_000) : null;
  if (!args.includes("--apply")) { process.stdout.write(`Dry run: grant ${tier} to user ${user.id}${endsAt ? ` until ${endsAt.toISOString()}` : ""}\n`); return; }
  await setEntitlement(db, { userId: user.id, tier, endsAt });
  process.stdout.write(`Granted ${tier} to user ${user.id}\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Failed"}\n`); process.exitCode = 1; }).finally(() => closePool());

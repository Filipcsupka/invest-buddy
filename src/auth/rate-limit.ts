import { createHmac } from "node:crypto";
import type pg from "pg";

export function authClientIp(headers: Headers): string {
  const hops = Math.max(1, Number(process.env.RATE_LIMIT_TRUSTED_HOPS) || 1);
  const parts = (headers.get("x-forwarded-for") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts[Math.max(0, parts.length - hops)] ?? headers.get("x-real-ip") ?? "unknown";
}

/** Atomic DB counter shared by web replicas; keys contain no address or email. */
export async function takeAuthLimit(db: Pick<pg.Pool, "query">, kind: "email" | "ip" | "user", value: string, max: number, windowSeconds: number, now = Date.now()): Promise<boolean> {
  const secret = process.env.RATE_LIMIT_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET or RATE_LIMIT_SECRET is required");
  const key = `auth:${kind}:${createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex")}`;
  const result = await db.query<{ count: number }>(
    `INSERT INTO auth_rate_limits (key, count, last_request) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN auth_rate_limits.last_request <= $3 THEN 1 ELSE auth_rate_limits.count + 1 END,
       last_request = CASE WHEN auth_rate_limits.last_request <= $3 THEN $2 ELSE auth_rate_limits.last_request END
     RETURNING count`,
    [key, now, now - windowSeconds * 1000],
  );
  return result.rows[0].count <= max;
}

export function validAuthOrigin(request: Request, siteUrl: string): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(siteUrl).origin;
}

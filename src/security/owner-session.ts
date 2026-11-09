import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_COOKIE = "__Host-owner_session";
export const OWNER_SESSION_SECONDS = 12 * 60 * 60;

type OwnerEnv = Record<string, string | undefined>;

function signingKey(password: string, env: OwnerEnv): Buffer | null {
  const secret = env.OWNER_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !password) return null;
  return createHmac("sha256", secret).update("investbuddy:owner-session:v1\0").update(password).digest();
}

function signature(payload: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function issueOwnerSession(password: string, env: OwnerEnv = process.env, now = Date.now()): string | null {
  const key = signingKey(password, env);
  if (!key) return null;
  const payload = `v1.${now}.${now + OWNER_SESSION_SECONDS * 1000}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signature(payload, key).toString("base64url")}`;
}

export function verifyOwnerSession(token: string | null, password: string | undefined, env: OwnerEnv = process.env, now = Date.now()): boolean {
  if (!token || !password || token.length > 256) return false;
  const match = /^(v1\.(\d{13})\.(\d{13})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const issued = Number(match[2]);
  const expires = Number(match[3]);
  if (!Number.isSafeInteger(issued) || !Number.isSafeInteger(expires) || issued > now || expires <= now || expires - issued !== OWNER_SESSION_SECONDS * 1000) return false;
  const key = signingKey(password, env);
  if (!key) return false;
  const supplied = Buffer.from(match[4], "base64url");
  const expected = signature(match[1], key);
  return supplied.toString("base64url") === match[4] && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function ownerSessionFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  const values = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${OWNER_SESSION_COOKIE}=`));
  return values.length === 1 ? values[0].slice(OWNER_SESSION_COOKIE.length + 1) : null;
}

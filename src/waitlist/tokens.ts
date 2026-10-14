import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, URL safe. Only its SHA-256 is stored. */
export function newConfirmToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.WAITLIST_TOKEN_SECRET ?? "";
  if (secret.length < 32) throw new Error("WAITLIST_TOKEN_SECRET must be set to at least 32 characters");
  return secret;
}

const signature = (id: number, secret: string) => createHmac("sha256", secret).update(`waitlist-unsubscribe:${id}`).digest("base64url");

/** Unsubscribe link token: `<id>.<hmac>`. It never expires, so an old mail still unsubscribes. */
export function unsubscribeToken(id: number, secret: string): string {
  return `${id}.${signature(id, secret)}`;
}

/** The row id when the token is genuine, otherwise null. */
export function verifyUnsubscribeToken(token: string, secret: string): number | null {
  const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const id = Number(match[1]);
  const expected = Buffer.from(signature(id, secret));
  const given = Buffer.from(match[2]);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

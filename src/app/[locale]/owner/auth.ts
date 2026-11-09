import { createHash, timingSafeEqual } from "node:crypto";
import { ownerSessionFromCookieHeader, verifyOwnerSession } from "@/security/owner-session";

export function ownerPasswordMatches(supplied: string, password: string | undefined): boolean {
  if (!password) return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(password).digest();
  return timingSafeEqual(left, right);
}

function basicAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password || !header?.startsWith("Basic ") || header.length > 2048) return false;
  const encoded = header.slice(6);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
  let credential: string;
  try { credential = Buffer.from(encoded, "base64").toString("utf8"); } catch { return false; }
  const supplied = credential.startsWith("owner:") ? credential.slice(6) : "";
  return ownerPasswordMatches(supplied, password);
}

/** Accept a Basic header or a signed owner session from request headers. */
export function ownerAuthorized(input: Headers | { get(name: string): string | null } | string | null, password: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const authorization = typeof input === "string" || input === null ? input : input.get("authorization");
  if (basicAuthorized(authorization, password)) return true;
  if (authorization?.startsWith("OwnerSession ") && verifyOwnerSession(authorization.slice(13), password, env)) return true;
  if (!input || typeof input === "string") return false;
  return verifyOwnerSession(ownerSessionFromCookieHeader(input.get("cookie")), password, env);
}

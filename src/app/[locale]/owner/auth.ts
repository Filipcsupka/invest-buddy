import { timingSafeEqual } from "node:crypto";

/** Basic auth check for the private /owner pages. The password comes from OWNER_RESEARCH_PASSWORD. */
export function ownerAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password || !header?.startsWith("Basic ")) return false;
  let credential: string;
  try { credential = Buffer.from(header.slice(6), "base64").toString("utf8"); } catch { return false; }
  const supplied = credential.startsWith("owner:") ? credential.slice(6) : "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(password);
  return a.length === b.length && timingSafeEqual(a, b);
}

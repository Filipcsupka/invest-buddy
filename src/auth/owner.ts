/** Owner user ids from OWNER_USER_IDS (comma list). Never hardcoded; empty when unset. */
export function ownerUserIds(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set((env.OWNER_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
}

/**
 * Owner = a signed-in session user whose id is listed in OWNER_USER_IDS. An email address never makes anyone owner: password
 * sign-up has no email verification at launch, so another account with the same address has a different id and is a normal customer.
 */
export function isOwnerUser(user: { id?: string | number | null } | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (user?.id === undefined || user.id === null) return false;
  return ownerUserIds(env).has(String(user.id));
}

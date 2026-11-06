/** Allow stored EODHD facts in the owner's private scoring path. This does not grant public display rights. */
export const eodhdPrivateUse = (env: Record<string, string | undefined> = process.env): boolean => env.EODHD_PRIVATE_USE === "on";

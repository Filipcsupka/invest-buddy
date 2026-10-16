import { z } from "zod";

// One source for feature flags. Each flag is "on" or "off"; unset or any other
// value falls back to the default below. The environment is read on every call
// so tests and runtime changes to process.env are honoured.
const onOff = z.enum(["on", "off"]);

export type FlagName = "PAYWALL" | "AUTH" | "BILLING" | "WAITLIST" | "ADVICE_OUTPUT" | "IDEAS_PAGE" | "INSIDERS_PAGE" | "OWNER_VIEW" | "DESIGN_VIEW";
export type Flags = Record<FlagName, boolean>;

function parse(raw: string | undefined, fallback: boolean): boolean {
  const result = onOff.safeParse(raw);
  return result.success ? result.data === "on" : fallback;
}

export function flags(env: Record<string, string | undefined> = process.env): Flags {
  const fixture = env.DATA_MODE === "fixture";
  return {
    // Enforce tiers for non-admin viewers (src/config/tiers.ts). It no longer hides /scanner. While AUTH is off every viewer is admin.
    PAYWALL: parse(env.PAYWALL, false),
    AUTH: parse(env.AUTH, false),
    BILLING: parse(env.BILLING, false),
    WAITLIST: parse(env.WAITLIST, false),
    // Public action, size and plan wording stays hidden until legal review.
    ADVICE_OUTPUT: parse(env.ADVICE_OUTPUT, false),
    // Today's behaviour: the ideas page is always on in fixture mode.
    IDEAS_PAGE: fixture || parse(env.IDEAS_PAGE, false),
    INSIDERS_PAGE: parse(env.INSIDERS_PAGE, true),
    OWNER_VIEW: parse(env.OWNER_VIEW, false),
    // The /design kit review page in production. Off by default.
    DESIGN_VIEW: parse(env.DESIGN_VIEW, false),
  };
}

/** The /design review page: on with DESIGN_VIEW, in fixture mode, or outside a production build. */
export function designViewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return flags(env).DESIGN_VIEW || env.DATA_MODE === "fixture" || env.NODE_ENV !== "production";
}

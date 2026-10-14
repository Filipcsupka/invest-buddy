// Event names and a safe `track`. Events carry only these props: no email, no
// user id, no free text. The script sets no cookie and keeps no cross-site id.

export const EVENTS = ["waitlist_view", "waitlist_submit", "waitlist_confirm", "pricing_view", "variant"] as const;
export type AnalyticsEvent = (typeof EVENTS)[number];

const PROP_KEYS = ["variant", "source", "locale"] as const;
export type AnalyticsProps = Partial<Record<(typeof PROP_KEYS)[number], string>>;

type Plausible = ((name: string, options?: { props: Record<string, string> }) => void) & { q?: unknown[] };

/** Drops every key outside the allowlist and anything that is not a short plain string. */
export function cleanProps(props: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PROP_KEYS) {
    const value = props[key];
    if (typeof value === "string" && /^[a-z0-9_-]{1,32}$/i.test(value)) out[key] = value;
  }
  return out;
}

/** True when the browser sends Do Not Track or Global Privacy Control. */
export function optedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined, win?: object): boolean {
  return nav?.doNotTrack === "1" || nav?.doNotTrack === "yes" || (win as { doNotTrack?: string } | undefined)?.doNotTrack === "1" || nav?.globalPrivacyControl === true;
}

/** No-op when the browser opts out (DNT, GPC) or the analytics script tag is not on the page. Events sent before the script loads are queued. */
export function track(name: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (typeof window === "undefined" || optedOut(typeof navigator === "undefined" ? undefined : navigator, window) || !document.querySelector("script[data-analytics]")) return;
  const w = window as unknown as { plausible?: Plausible };
  if (!w.plausible) {
    const queue: Plausible = (...args: unknown[]) => { (queue.q ??= []).push(args); };
    w.plausible = queue;
  }
  const clean = cleanProps(props);
  w.plausible(name, Object.keys(clean).length ? { props: clean } : undefined);
}

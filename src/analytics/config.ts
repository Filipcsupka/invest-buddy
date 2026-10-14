// Cookie-free analytics, off by default. Written for Plausible (self-hosted
// CE is the owner-decision default, README decision 17) but any tool that
// loads one script and takes `data-domain` works. Nothing loads unless all
// three are set: ANALYTICS=on, ANALYTICS_URL (full script URL, https) and
// ANALYTICS_DOMAIN (the site host the tool counts for).

export interface AnalyticsConfig {
  scriptSrc: string;
  domain: string;
}

const HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

export function analyticsConfig(env: Record<string, string | undefined> = process.env): AnalyticsConfig | null {
  if (env.ANALYTICS?.trim().toLowerCase() !== "on") return null;
  const domain = env.ANALYTICS_DOMAIN?.trim() ?? "";
  if (!HOST.test(domain)) return null;
  let url: URL;
  try {
    url = new URL(env.ANALYTICS_URL?.trim() ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return { scriptSrc: url.toString(), domain };
}

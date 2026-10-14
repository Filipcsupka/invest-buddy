import { analyticsConfig } from "@/analytics/config";

/** Renders the analytics script only when ANALYTICS, ANALYTICS_URL and ANALYTICS_DOMAIN are all set. */
export function Analytics() {
  const config = analyticsConfig();
  if (!config) return null;
  return <script defer data-analytics="" data-domain={config.domain} src={config.scriptSrc} />;
}

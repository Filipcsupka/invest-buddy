import { analyticsConfig } from "@/analytics/config";

/** Escapes `<` so a value can sit inside an inline script. */
const lit = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * Loads the analytics script only when ANALYTICS, ANALYTICS_URL and ANALYTICS_DOMAIN are all set,
 * and in the browser only when it does not send Do Not Track or Global Privacy Control.
 */
export function Analytics() {
  const config = analyticsConfig();
  if (!config) return null;
  const code = `(function(){var n=navigator;if(n.doNotTrack==="1"||n.doNotTrack==="yes"||window.doNotTrack==="1"||n.globalPrivacyControl===true)return;var s=document.createElement("script");s.defer=true;s.setAttribute("data-analytics","");s.setAttribute("data-domain",${lit(config.domain)});s.src=${lit(config.scriptSrc)};document.head.appendChild(s)})()`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

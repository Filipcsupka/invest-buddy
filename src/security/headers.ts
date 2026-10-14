import { analyticsConfig } from "../analytics/config";

/** Security headers for every response. Set from next.config.ts `headers()`, which Next evaluates at build time, so ANALYTICS_* must be set for the build. */
export function contentSecurityPolicy(dev = false, analytics: { scriptSrc: string } | null = analyticsConfig()): string {
  // The analytics tool loads its script and posts events to its own origin, and nothing else is allowed.
  const origin = analytics ? new URL(analytics.scriptSrc).origin : "";
  return [
    "default-src 'self'",
    // Next streams inline hydration scripts and the layout has an inline theme script; a nonce or hash policy is a follow-up.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${origin ? ` ${origin}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${origin ? ` ${origin}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(production = process.env.NODE_ENV === "production"): { key: string; value: string }[] {
  const list = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(!production) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ];
  // Traefik terminates TLS for invest.filipcsupka.online (ingress.yaml, cert-manager); no HSTS in dev.
  if (production) list.push({ key: "Strict-Transport-Security", value: "max-age=15552000" });
  return list;
}

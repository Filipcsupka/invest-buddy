import type { Instrumentation } from "next";

/**
 * Server start: fill the hot listing caches in the background so the first visitors after a deploy, restart or purge
 * do not all run the heavy score read. Not awaited, so readiness is not delayed; a database outage is only logged.
 * WEB_CACHE_WARM=off skips it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build" || process.env.WEB_CACHE_WARM === "off") return;
  void import("./data/store").then(({ warmWebCaches }) => warmWebCaches()).catch((error: unknown) => {
    console.warn(JSON.stringify({ event: "web_cache_warm_failed", error: error instanceof Error ? error.name : "unknown" }));
  });
}

/** React may fail after a page function returns; capture those server render failures too. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (context.routeType !== "render") return;
  const route = context.routePath;
  const locale = /^\/(en|sk)(?:\/|$)/.exec(request.path)?.[1] ?? null;
  const requestId = request.headers["x-request-id"];
  const start = Number(request.headers["x-request-start-ms"]);
  const durationMs = Number.isFinite(start) && start > 0 ? Math.max(0, Date.now() - start) : 0;
  const digest = (error as { digest?: unknown } | null)?.digest;
  const stack = error instanceof Error ? error.stack?.split("\n").slice(1).filter((line: string) => /^\s*at\s/.test(line)).join("\n") : undefined;
  console.error(JSON.stringify({ event: "http_request", route, locale, status: 500, durationMs, requestId, message: "Page render failed", ...(typeof digest === "string" ? { digest } : {}), ...(stack ? { stack } : {}) }));
};

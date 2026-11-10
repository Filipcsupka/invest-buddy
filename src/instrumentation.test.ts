import { afterEach, expect, it, vi } from "vitest";
const warm = vi.fn();
vi.mock("./data/store", () => ({ warmWebCaches: () => warm() }));
import { onRequestError, register } from "./instrumentation";

afterEach(() => vi.restoreAllMocks());

it("records a server render failure without its sensitive message", async () => {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((line) => { lines.push(String(line)); });
  await onRequestError(Object.assign(new Error("secret-token"), { digest: "d-1" }), { path: "/en/dashboard", headers: { "x-request-id": "req-1" } } as never, { routeType: "render", routePath: "/[locale]/dashboard" } as never);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ event: "http_request", route: "/[locale]/dashboard", locale: "en", status: 500, requestId: "req-1", digest: "d-1", message: "Page render failed" });
  expect(lines[0]).not.toContain("secret-token");
});

it("does not duplicate route handler errors or health logs", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  await onRequestError(new Error("failure"), { path: "/api/health", headers: {} } as never, { routeType: "route", routePath: "/api/health" } as never);
  expect(output).not.toHaveBeenCalled();
});

it("starts the cache warm-up without waiting for it or failing start-up", async () => {
  const runtime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = "nodejs";
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  warm.mockReset().mockReturnValue(new Promise(() => {}));
  await expect(register()).resolves.toBeUndefined();
  await vi.waitFor(() => expect(warm).toHaveBeenCalledTimes(1));
  warm.mockReset().mockRejectedValue(new Error("db down"));
  await expect(register()).resolves.toBeUndefined();
  await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("web_cache_warm_failed")));
  process.env.WEB_CACHE_WARM = "off";
  warm.mockReset();
  await register();
  delete process.env.WEB_CACHE_WARM;
  if (runtime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = runtime;
  await register();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(warm).not.toHaveBeenCalled();
});

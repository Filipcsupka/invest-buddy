import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { analyticsConfig } from "./config";
import { cleanProps, EVENTS, track } from "./events";
import { Analytics } from "@/components/analytics";

const keys = ["ANALYTICS", "ANALYTICS_URL", "ANALYTICS_DOMAIN"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  vi.unstubAllGlobals();
});

const ok = { ANALYTICS: "on", ANALYTICS_URL: "https://stats.example.org/js/script.js", ANALYTICS_DOMAIN: "invest.example.org" };

it("is off by default and when any setting is missing or unsafe", () => {
  expect(analyticsConfig({})).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS: undefined })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS: "off" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_URL: undefined })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_URL: "not a url" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_URL: "http://stats.example.org/js/script.js" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_URL: "https://u:p@stats.example.org/s.js" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_DOMAIN: "" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_DOMAIN: 'x" onload="y' })).toBeNull();
});

it("returns the script and domain when fully set", () => {
  expect(analyticsConfig(ok)).toEqual({ scriptSrc: ok.ANALYTICS_URL, domain: ok.ANALYTICS_DOMAIN });
});

it("renders no script tag with the env unset", () => {
  for (const k of keys) delete process.env[k];
  expect(renderToStaticMarkup(createElement(Analytics))).toBe("");
  process.env.ANALYTICS_URL = ok.ANALYTICS_URL;
  process.env.ANALYTICS_DOMAIN = ok.ANALYTICS_DOMAIN;
  expect(renderToStaticMarkup(createElement(Analytics))).toBe("");
});

it("renders one deferred script when enabled", () => {
  Object.assign(process.env, ok);
  const html = renderToStaticMarkup(createElement(Analytics));
  expect(html).toContain("<script");
  expect(html).toContain('data-domain="invest.example.org"');
  expect(html).toContain('src="https://stats.example.org/js/script.js"');
  expect(html).toContain("defer");
  expect(html.match(/<script/g)).toHaveLength(1);
});

it("lists the five events", () => {
  expect([...EVENTS]).toEqual(["waitlist_view", "waitlist_submit", "waitlist_confirm", "pricing_view", "variant"]);
});

it("drops props outside the allowlist, including an email", () => {
  expect(cleanProps({ variant: "a", source: "landing", locale: "sk", email: "a@b.co", extra: "x" })).toEqual({ variant: "a", source: "landing", locale: "sk" });
  expect(cleanProps({ variant: "a@b.co" })).toEqual({});
  expect(cleanProps({ variant: "x".repeat(40) })).toEqual({});
});

it("does nothing without the script tag and queues events when it is present", () => {
  const w: Record<string, unknown> = {};
  vi.stubGlobal("window", w);
  let present = false;
  vi.stubGlobal("document", { querySelector: () => (present ? {} : null) });
  track("pricing_view", { variant: "a" });
  expect(w.plausible).toBeUndefined();
  present = true;
  track("pricing_view", { variant: "a", email: "a@b.co" } as never);
  track("waitlist_view");
  const queue = (w.plausible as { q: unknown[][] }).q;
  expect(queue).toEqual([["pricing_view", { props: { variant: "a" } }], ["waitlist_view", undefined]]);
});

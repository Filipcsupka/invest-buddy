import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { analyticsConfig } from "./config";
import { runInNewContext } from "node:vm";
import { cleanProps, EVENTS, optedOut, track } from "./events";
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
  expect(analyticsConfig({ ...ok, ANALYTICS_DOMAIN: "localhost" })).toBeNull();
  expect(analyticsConfig({ ...ok, ANALYTICS_DOMAIN: "a..b" })).toBeNull();
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

const loader = () => /<script>([\s\S]*)<\/script>/.exec(renderToStaticMarkup(createElement(Analytics)))?.[1] ?? "";
const run = (nav: Record<string, unknown>, win: Record<string, unknown> = {}) => {
  const added: Record<string, unknown>[] = [];
  const attrs: Record<string, string> = {};
  runInNewContext(loader().replace(/&quot;/g, '"').replace(/&#x27;/g, "'"), {
    navigator: nav,
    window: win,
    document: { createElement: () => ({ setAttribute: (k: string, v: string) => { attrs[k] = v; } }), head: { appendChild: (el: Record<string, unknown>) => added.push({ ...el, attrs }) } },
  });
  return added;
};

it("renders a loader that adds one deferred script when enabled", () => {
  Object.assign(process.env, ok);
  const html = renderToStaticMarkup(createElement(Analytics));
  expect(html.match(/<script/g)).toHaveLength(1);
  expect(html).not.toContain("<script src");
  const added = run({});
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ defer: true, src: ok.ANALYTICS_URL, attrs: { "data-analytics": "", "data-domain": ok.ANALYTICS_DOMAIN } });
});

it("loads nothing when the browser sends Do Not Track or Global Privacy Control", () => {
  Object.assign(process.env, ok);
  expect(run({ doNotTrack: "1" })).toHaveLength(0);
  expect(run({}, { doNotTrack: "1" })).toHaveLength(0);
  expect(run({ globalPrivacyControl: true })).toHaveLength(0);
  expect(run({ doNotTrack: "0", globalPrivacyControl: false })).toHaveLength(1);
});

it("detects DNT and GPC", () => {
  expect(optedOut({ doNotTrack: "1" })).toBe(true);
  expect(optedOut({ globalPrivacyControl: true })).toBe(true);
  expect(optedOut({}, { doNotTrack: "1" })).toBe(true);
  expect(optedOut({ doNotTrack: "0" })).toBe(false);
  expect(optedOut(undefined)).toBe(false);
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

it("sends nothing when DNT or GPC is set, even with the script tag present", () => {
  const w: Record<string, unknown> = {};
  vi.stubGlobal("window", w);
  vi.stubGlobal("document", { querySelector: () => ({}) });
  vi.stubGlobal("navigator", { doNotTrack: "1" });
  track("pricing_view");
  expect(w.plausible).toBeUndefined();
  vi.stubGlobal("navigator", { globalPrivacyControl: true });
  track("pricing_view");
  expect(w.plausible).toBeUndefined();
});

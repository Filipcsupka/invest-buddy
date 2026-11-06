import { describe, expect, it } from "vitest";
import { designViewEnabled, flags } from "./flags";

const NAMES = ["PAYWALL", "AUTH", "BILLING", "WAITLIST", "ADVICE_OUTPUT", "OWNER_VIEW", "DESIGN_VIEW", "PUBLIC_EARNINGS_DATES"] as const;

describe("flags", () => {
  it("defaults everything off when unset", () => {
    expect(flags({})).toEqual({ PAYWALL: false, AUTH: false, BILLING: false, WAITLIST: false, ADVICE_OUTPUT: false, IDEAS_PAGE: false, INSIDERS_PAGE: true, OWNER_VIEW: false, DESIGN_VIEW: false, PUBLIC_EARNINGS_DATES: false });
  });

  for (const name of NAMES) {
    it(`${name}: on, off and junk`, () => {
      expect(flags({ [name]: "on" })[name]).toBe(true);
      expect(flags({ [name]: "off" })[name]).toBe(false);
      for (const junk of ["", "true", "1", "ON", "yes"]) expect(flags({ [name]: junk })[name]).toBe(false);
    });
  }

  it("IDEAS_PAGE: on, off, junk, and always on in fixture mode", () => {
    expect(flags({ IDEAS_PAGE: "on" }).IDEAS_PAGE).toBe(true);
    expect(flags({ IDEAS_PAGE: "off" }).IDEAS_PAGE).toBe(false);
    expect(flags({ IDEAS_PAGE: "junk" }).IDEAS_PAGE).toBe(false);
    expect(flags({ DATA_MODE: "fixture" }).IDEAS_PAGE).toBe(true);
    expect(flags({ DATA_MODE: "fixture", IDEAS_PAGE: "off" }).IDEAS_PAGE).toBe(true);
    expect(flags({ DATA_MODE: "db" }).IDEAS_PAGE).toBe(false);
  });

  it("INSIDERS_PAGE defaults on and can be disabled", () => {
    expect(flags({}).INSIDERS_PAGE).toBe(true);
    expect(flags({ INSIDERS_PAGE: "off" }).INSIDERS_PAGE).toBe(false);
  });

  it("reads process.env by default", () => {
    const prev = process.env.WAITLIST;
    process.env.WAITLIST = "on";
    try { expect(flags().WAITLIST).toBe(true); } finally { if (prev === undefined) delete process.env.WAITLIST; else process.env.WAITLIST = prev; }
  });

  it("opens the design page only with DESIGN_VIEW, fixture data or a non-production build", () => {
    expect(designViewEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(designViewEnabled({ NODE_ENV: "production", DESIGN_VIEW: "on" })).toBe(true);
    expect(designViewEnabled({ NODE_ENV: "production", DATA_MODE: "fixture" })).toBe(true);
    expect(designViewEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(designViewEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});

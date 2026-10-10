import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { EXTRA_SOURCES, LEGACY_SOURCES } from "../collectors/types";
import { PING_NAMES } from "../collectors/sources/registry";
import { LICENSES } from "../collectors/sources/common";
import { canDisplay, DATA_SOURCES, FACT_SOURCE_IDS, getSource, licenceClassFor, sourceIdFor, LICENCE_CLASSES, licenseFor, seedSql, updateSql } from "./sources-registry";

const migration = readFileSync(join(process.cwd(), "migrations", "022_data_sources.sql"), "utf8");
const news = readFileSync(join(process.cwd(), "migrations", "042_news_sources.sql"), "utf8");
const provenance = readFileSync(join(process.cwd(), "migrations", "023_row_provenance.sql"), "utf8");

describe("data source registry", () => {
  it("has a row for every collector name and every source the collectors stamp on documents", () => {
    const names = new Set<string>([...LEGACY_SOURCES, ...EXTRA_SOURCES, ...PING_NAMES, "sec-frames", "sec-getcurrent", "sec-13f", "twelvedata"]);
    for (const name of names) expect(getSource(name), name).toBeDefined();
  });

  it("has unique ids and only known licence classes", () => {
    expect(new Set(DATA_SOURCES.map((item) => item.id)).size).toBe(DATA_SOURCES.length);
    for (const item of DATA_SOURCES) expect(LICENCE_CLASSES).toContain(item.licenceClass);
  });

  it("never allows display or redistribution for an unknown class", () => {
    const unknown = DATA_SOURCES.filter((item) => item.licenceClass === "unknown");
    expect(unknown.length).toBeGreaterThan(0);
    for (const item of unknown) {
      expect(canDisplay(item.id), item.id).toBe(false);
      expect(item.displayAllowed, item.id).toBe(false);
      expect(item.redistributionAllowed, item.id).toBe(false);
    }
  });

  it("returns true for SEC (by id and by collector name) and false for unknown or missing sources", () => {
    expect(canDisplay("sec")).toBe(true);
    expect(canDisplay("edgar")).toBe(true);
    expect(canDisplay("gdelt")).toBe(false);
    expect(canDisplay("alphavantage")).toBe(false);
    expect(canDisplay("no-such-source")).toBe(false);
  });

  it("feeds LICENSES from the registry", () => {
    for (const [key, license] of Object.entries(LICENSES)) expect(license).toEqual(licenseFor(key));
    expect(LICENSES.sec.display_allowed).toBe(true);
    expect(LICENSES.cboe.display_allowed).toBe(false);
  });

  it("keeps migration 022 seed in step with the constants, except the rows migration 042 later updates", () => {
    const original = DATA_SOURCES.map((item) => item.id === "rss"
      ? { ...item, name: "GlobeNewswire RSS", notes: "GlobeNewswire feed text. Redistribution terms not checked; internal signal only." }
      : item.id === "gdelt"
        ? { ...item, licenceClass: "unknown" as const, termsUrl: null, termsCheckedOn: null, attributionText: null, rateLimitNote: null, notes: "GDELT DOC 2.0. Terms of use not checked; internal signal only." }
        : item);
    expect(migration).toContain(seedSql(original));
  });

  it("keeps migration 042 in step with the rss and gdelt rows, display off for both", () => {
    expect(news).toContain(updateSql(["rss", "gdelt"]));
    expect(getSource("gdelt")).toMatchObject({ licenceClass: "public_attrib", termsUrl: "https://www.gdeltproject.org/about.html", termsCheckedOn: "2026-10-10", displayAllowed: false });
    expect(getSource("gdelt")!.attributionText).toContain("gdeltproject.org");
    expect(canDisplay("rss")).toBe(false);
    expect(canDisplay("gdelt")).toBe(false);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)("applies to the live schema and stores the same rows", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      const rows = await pool.query<{ id: string; licence_class: string; display_allowed: boolean }>("SELECT id, licence_class, display_allowed FROM data_sources");
      expect(rows.rows.map((row) => row.id).sort()).toEqual(DATA_SOURCES.map((item) => item.id).sort());
      for (const row of rows.rows) expect(row.display_allowed, row.id).toBe(canDisplay(row.id));
      await expect(pool.query("INSERT INTO data_sources (id, name, kind, licence_class, display_allowed) VALUES ('t', 't', 'other', 'unknown', true)")).rejects.toThrow();
    } finally { await pool.end(); }
  });

  it("keeps the fact-key map in migration 023 in step with FACT_SOURCE_IDS", () => {
    for (const [key, id] of Object.entries(FACT_SOURCE_IDS)) {
      expect(getSource(id), key).toBeDefined();
      expect(provenance, key).toContain(`WHEN '${key}' THEN '${id}'`);
    }
  });

  it("maps collector names to registry ids the same way in migration 023 as in code", () => {
    for (const name of ["edgar", "frames", "getcurrent", "13f", "sec-frames", "sec-getcurrent", "sec-13f", "vix"]) {
      expect(provenance, name).toContain(`WHEN '${name}' THEN '${sourceIdFor(name)}'`);
    }
    expect(licenceClassFor("edgar")).toBe("public_gov");
    expect(licenceClassFor("not-a-source")).toBe("unknown");
  });
});

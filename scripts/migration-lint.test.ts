import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintMigrations } from "./migration-lint";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/migration-lint", `${name}.sql`), "utf8");
const lint = (name: string, base: string[] = ["070_x.sql"]) => lintMigrations([{ name: "080_case.sql", content: fixture(name) }], base);
const rules = (name: string) => lint(name).map((i) => i.rule);

describe("migration lint", () => {
  it("passes a clean file, ignoring comments", () => { expect(lint("clean")).toEqual([]); });
  it.each([
    ["drop-table", "drop-table"], ["drop-column", "drop-column"], ["truncate", "truncate"],
    ["alter-type", "alter-column-type"], ["index-no-guard", "index-if-not-exists"], ["index-concurrently", "index-concurrently"],
  ])("fails %s", (file, rule) => { expect(rules(file)).toEqual([rule]); });
  it("reports the statement's first line", () => { expect(lint("alter-type")[0].line).toBe(1); });
  it("does not flag a BEFORE TRUNCATE trigger", () => {
    expect(lintMigrations([{ name: "080_t.sql", content: "CREATE TRIGGER x BEFORE TRUNCATE ON t\n  FOR EACH STATEMENT EXECUTE FUNCTION f();\n" }], ["070_x.sql"])).toEqual([]);
  });
  it("accepts a lint:allow comment with a reason on the line before", () => { expect(lint("allowed-drop")).toEqual([]); });
  it("rejects lint:allow without a reason", () => {
    const issues = lint("allow-without-reason");
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("needs a reason");
  });
  it("never allows CREATE INDEX CONCURRENTLY", () => {
    const issues = lintMigrations([{ name: "080_c.sql", content: "-- lint:allow because\nCREATE INDEX CONCURRENTLY i ON t (c);\n" }], ["070_x.sql"]);
    expect(issues.map((i) => i.rule)).toEqual(["index-concurrently"]);
  });
  it("fails a duplicate number against the base and within the batch", () => {
    expect(lintMigrations([{ name: "070_other.sql", content: "SELECT 1;" }], ["070_x.sql"]).map((i) => i.rule)).toContain("duplicate-number");
    const twice = lintMigrations([{ name: "080_a.sql", content: "SELECT 1;" }, { name: "080_b.sql", content: "SELECT 1;" }], ["070_x.sql"]);
    expect(twice.map((i) => i.rule)).toEqual(["duplicate-number"]);
  });
  it("fails a number at or below the base maximum unless allowed, and allows gaps", () => {
    expect(lintMigrations([{ name: "060_a.sql", content: "SELECT 1;" }], ["070_x.sql"]).map((i) => i.rule)).toEqual(["number-order"]);
    expect(lintMigrations([{ name: "060_a.sql", content: "-- lint:allow-order range reserved earlier\nSELECT 1;" }], ["070_x.sql"])).toEqual([]);
    expect(lintMigrations([{ name: "090_a.sql", content: "SELECT 1;" }], ["070_x.sql"])).toEqual([]);
  });
  it("fails a bad name", () => {
    expect(lintMigrations([{ name: "80-case.sql", content: "SELECT 1;" }], []).map((i) => i.rule)).toEqual(["name"]);
  });
});

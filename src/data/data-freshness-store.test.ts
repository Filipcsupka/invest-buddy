import { describe, expect, it } from "vitest";
import { FRESHNESS_SQL } from "./data-freshness-store";
import { getDataStatusMessages } from "../i18n/data-status-messages";

describe("freshness query", () => {
  const part = (dataset: string) => FRESHNESS_SQL.split("UNION ALL").find((p) => p.includes(`'${dataset}'`)) ?? "";

  it("keeps macro public and admits EODHD news dates only in private mode", () => {
    expect(part("macro")).toMatch(/JOIN data_sources s ON s\.id = m\.source_id AND s\.display_allowed/);
    expect(part("news")).toContain("s.display_allowed OR ($2::boolean AND d.source_id = 'eodhd')");
  });

  it("does not name a single vendor for the macro dataset", () => {
    for (const locale of ["en", "sk"] as const) expect(getDataStatusMessages(locale).datasets.macro.source).not.toMatch(/FRED|Cboe/i);
  });
});

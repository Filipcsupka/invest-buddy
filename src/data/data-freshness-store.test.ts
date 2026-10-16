import { describe, expect, it } from "vitest";
import { FRESHNESS_SQL } from "./data-freshness-store";
import { getDataStatusMessages } from "../i18n/data-status-messages";

describe("freshness query", () => {
  const part = (dataset: string) => FRESHNESS_SQL.split("UNION ALL").find((p) => p.includes(`'${dataset}'`)) ?? "";

  it("counts macro and news rows only from sources with display_allowed", () => {
    for (const dataset of ["macro", "news"]) {
      expect(part(dataset)).toMatch(/JOIN data_sources s ON s\.id = \w\.(?:source_id|source) AND s\.display_allowed/);
    }
  });

  it("does not name a single vendor for the macro dataset", () => {
    for (const locale of ["en", "sk"] as const) expect(getDataStatusMessages(locale).datasets.macro.source).not.toMatch(/FRED|Cboe/i);
  });
});

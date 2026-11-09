import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { scoredUniverse } from "@/data/scored";
import { StateFilterProvider, type StateFilter } from "@/components/state-filter";
import { toRow } from "@/components/view-model";
import { ProfileLists } from "./profile-lists";

async function fixture() {
  const screen = (await scoredUniverse()).map((row) => toRow("en", row));
  const first = screen[0];
  const other = screen.find((row) => row.state !== first.state);
  if (!other) throw new Error("fixture needs two different statuses");
  const horizons = Object.fromEntries([first, other].map((row) => [row.ticker, { ticker: row.ticker, profile: "event_driven" as const, values: {} }]));
  const html = (initial: StateFilter) => renderToStaticMarkup(<StateFilterProvider initial={initial}><ProfileLists locale="en" rows={screen} horizons={horizons} /></StateFilterProvider>);
  return { first, other, html };
}

describe("profile lists follow the selected status", () => {
  it("shows every name with no status selected", async () => {
    const { first, other, html } = await fixture();
    const out = html("all");
    expect(out).toContain(`>${first.ticker}<`);
    expect(out).toContain(`>${other.ticker}<`);
  });
  it("hides names whose status is not selected", async () => {
    const { first, other, html } = await fixture();
    const out = html(first.state as StateFilter);
    expect(out).toContain(`>${first.ticker}<`);
    expect(out).not.toContain(`>${other.ticker}<`);
  });
});

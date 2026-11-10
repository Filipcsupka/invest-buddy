import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DataTable } from "./table";

it("formats stored close values without turning missing values into zero", () => {
  const html = renderToStaticMarkup(<DataTable rows={[{ close: "1234.5000" }, { close: null }]} columns={[{ key: "close", label: "Latest close" }]} empty="Empty" locale="en" />);
  expect(html).toContain("1,234.50");
  expect(html).toContain("—");
});

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { OperatorDisclosure } from "./operator-disclosure";

it("omits an empty disclosure and shows published text", () => {
  expect(renderToStaticMarkup(<OperatorDisclosure text="  " />)).toBe("");
  expect(renderToStaticMarkup(<OperatorDisclosure text="Published positions" />)).toContain("Published positions");
});

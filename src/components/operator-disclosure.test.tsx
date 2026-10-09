import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OperatorDisclosure } from "./operator-disclosure";

it("omits an empty disclosure and shows published text", () => {
  expect(renderToStaticMarkup(<OperatorDisclosure text="  " />)).toBe("");
  expect(renderToStaticMarkup(<OperatorDisclosure text="Published positions" />)).toContain("Published positions");
});

it("reads the text from the OPERATOR_DISCLOSURE_<LOCALE> variable and ignores blank values", async () => {
  const { getMessages } = await import("../i18n");
  vi.stubEnv("OPERATOR_DISCLOSURE_EN", "  Operator holds the shown positions.  ");
  vi.stubEnv("OPERATOR_DISCLOSURE_SK", "   ");
  expect(getMessages("en").common.operatorDisclosure).toBe("Operator holds the shown positions.");
  expect(getMessages("sk").common.operatorDisclosure).toBe("");
  vi.unstubAllEnvs();
  expect(getMessages("en").common.operatorDisclosure).toBe("");
});

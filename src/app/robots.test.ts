import { expect, it } from "vitest";
import robots from "./robots";
import { siteUrl } from "@/i18n/metadata";

it("allows crawling and names the sitemap", () => {
  expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: `${siteUrl}/sitemap.xml` });
});

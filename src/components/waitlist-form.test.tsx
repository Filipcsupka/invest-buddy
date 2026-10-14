import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages, locales } from "@/i18n";
import { WaitlistForm } from "./waitlist-form";

describe.each(locales)("WaitlistForm (%s)", (locale) => {
  const m = getMessages(locale).waitlist;
  const html = renderToStaticMarkup(<WaitlistForm locale={locale} labels={m} source="landing" priceVariant="a" />);
  const tag = (name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0] ?? "";

  it("renders the labelled email field, two separate consent boxes and a submit button", () => {
    expect(html).toContain(m.email);
    expect(html).toContain(m.consentLaunch);
    expect(html).toContain(m.consentWeekly);
    expect(html).toContain(m.submit);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(tag("consentLaunch")).toContain("required");
    expect(tag("consentWeekly")).not.toContain("required");
  });

  it("hides the honeypot from people and assistive tech", () => {
    expect(html).toContain('aria-hidden="true"><input');
    expect(tag("website")).toContain('tabindex="-1"');
  });

  it("has a label for the email input", () => {
    const inputId = /<input[^>]*id="([^"]+)"[^>]*type="email"/.exec(html)?.[1];
    expect(inputId).toBeTruthy();
    expect(html).toContain(`for="${inputId}"`);
  });
});

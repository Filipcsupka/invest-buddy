import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Methodology from "./methodology/page";
import Sizing from "./sizing/page";
import Privacy from "./legal/privacy/page";
import Terms from "./legal/terms/page";

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });

it.each(["en", "sk"])("renders informational pages without sample stamps in db mode (%s)", async (locale) => {
  const original = process.env.DATA_MODE;
  process.env.DATA_MODE = "db";
  try {
    for (const page of [Methodology, Sizing, Privacy, Terms]) {
      const html = renderToStaticMarkup(await page(props(locale)));
      expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA|synthetic|sample data|syntetick|ukážkov/i);
    }
  } finally { process.env.DATA_MODE = original; }
});

it.each([["en", "One reading (model) checked against the quote"], ["sk", "Jedno čítanie (model) overené voči citátu"]])("methodology has the source label legend (%s)", async (locale, text) => {
  const html = renderToStaticMarkup(await Methodology(props(locale)));
  expect(html).toContain('id="source-labels"');
  expect(html).toContain(text);
});

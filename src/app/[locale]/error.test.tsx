import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const params = vi.fn();
vi.mock("next/navigation", () => ({ useParams: () => params() }));
import ErrorPage from "./error";
import GlobalError from "../global-error";

const error = Object.assign(new Error("secret-token at /srv/app.ts"), { digest: "req-1234567" });

it.each([["en", "Back to home", "quote this reference"], ["sk", "Späť na úvod", "uveďte tento kód"]])("error page (%s) shows the id and a way back, no stack", (locale, home, hint) => {
  params.mockReturnValue({ locale });
  const html = renderToStaticMarkup(<ErrorPage error={error} reset={() => {}} />);
  expect(html).toContain("req-1234567");
  expect(html).toContain(hint);
  expect(html).toContain(home);
  expect(html).toContain(`href="/${locale}"`);
  expect(html).not.toMatch(/secret-token|app\.ts/);
});

it("global error renders with its own html, the id and a way back", () => {
  const html = renderToStaticMarkup(<GlobalError error={error} reset={() => {}} />);
  expect(html).toContain("<html");
  expect(html).toContain("req-1234567");
  expect(html).toContain('href="/en"');
  expect(html).not.toMatch(/secret-token|app\.ts/);
});

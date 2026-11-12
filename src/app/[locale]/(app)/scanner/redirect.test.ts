import { expect, it } from "vitest";
import ScannerRedirect from "./page";

it.each(["en", "sk"])("redirects the legacy scanner route and keeps filters (%s)", async (locale) => {
  await expect(ScannerRedirect({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ state: "watch", q: "NVDA" }) }))
    .rejects.toMatchObject({ digest: expect.stringContaining(`/${locale}/stocks?state=watch&q=NVDA`) });
});

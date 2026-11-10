import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import Welcome from "./page";

const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
const original = { waitlist: process.env.WAITLIST, billing: process.env.BILLING };
afterEach(() => {
  for (const [key, env] of [["WAITLIST", original.waitlist], ["BILLING", original.billing]] as const) if (env === undefined) delete process.env[key]; else process.env[key] = env;
});

it.each(["en", "sk"])("marks Plus as not open yet and sells nothing while BILLING is off (%s)", async (locale) => {
  process.env.WAITLIST = "on";
  delete process.env.BILLING;
  const html = renderToStaticMarkup(await Welcome(props(locale)));
  expect(html).toContain(locale === "en" ? "Opens when the data licence and billing are ready." : "Otvoríme, keď bude pripravená licencia na údaje a platby.");
  expect(html).not.toMatch(/checkout|stripe|card number|číslo karty/i);
  expect(html).not.toMatch(/most popular|najobľúbenejš|spots left|zostáva miest/i);
});

it("loads the motion libraries only through a dynamic import from the Welcome island", () => {
  const island = readFileSync("src/components/welcome/welcome-motion.tsx", "utf8");
  expect(island).toMatch(/import\("\.\/motion-engine"\)/);
  expect(island).not.toMatch(/from "gsap|from "lenis/);
  for (const file of ["src/app/[locale]/layout.tsx", "src/app/[locale]/page.tsx", "src/components/welcome/sections.tsx", "src/components/nav.tsx"]) {
    expect(readFileSync(file, "utf8"), file).not.toMatch(/["']gsap|["']lenis/);
  }
  expect(island).toMatch(/prefers-reduced-motion: reduce/);
});

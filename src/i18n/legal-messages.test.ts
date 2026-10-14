import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LegalPage, type LegalDoc } from "@/components/legal-page";
import { OPERATOR, OPERATOR_FIELDS, operatorIsPlaceholder } from "@/config/operator";
import { getLegalMessages } from "./legal-messages";

const leaves = (value: unknown, path = ""): [string, string][] =>
  typeof value === "string" ? [[path, value]] : Object.entries(value as object).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const docs: LegalDoc[] = ["privacy", "terms", "disclaimer"];

it("has the same keys, non-empty text and matching placeholders in EN and SK", () => {
  const en = leaves(getLegalMessages("en"));
  const sk = Object.fromEntries(leaves(getLegalMessages("sk")));
  expect(en.map(([key]) => key).sort()).toEqual(Object.keys(sk).sort());
  for (const [key, text] of en) {
    expect(text.trim(), key).not.toBe("");
    expect(sk[key].trim(), key).not.toBe("");
    expect(placeholders(sk[key]), key).toBe(placeholders(text));
  }
});

it("avoids banned promise, recommendation and urgency wording and em dashes", () => {
  const banned = /beat the market|guarantee|\breturns?\b|\bbuy\b|\bbest\b|act now|limited time|poraz\w* trh|zaručen|\bvýnos\w*|\bkúp\w*|\bnajlepš\w*|\bkupt\w*|—/i;
  for (const locale of ["en", "sk"] as const) {
    for (const [key, value] of leaves(getLegalMessages(locale))) expect(value, `${locale}.${key}`).not.toMatch(banned);
  }
});

it("states every disclaimer point in both languages", () => {
  const points = {
    en: [/informational screening only/i, /not financial advice/i, /no recommendation/i, /no offer/i, /past results do not predict future results/i, /you decide and you bear the risk/i, /incomplete or delayed/i],
    sk: [/iba informačný prehľad/i, /nie je to finančné poradenstvo/i, /odporúčanie/i, /ponuka/i, /minulé výsledky nepredpovedajú budúce/i, /rozhodujete vy a riziko znášate vy/i, /neúplné alebo oneskorené/i],
  };
  for (const locale of ["en", "sk"] as const) {
    const short = getLegalMessages(locale).short;
    for (const point of points[locale]) expect(short, `${locale} ${point}`).toMatch(point);
  }
});

it("privacy covers logs, cookies, analytics off, waitlist email, retention and deletion in both languages", () => {
  const topics = {
    en: [/server logs/i, /no tracking or advertising cookies/i, /off by default/i, /waitlist/i, /until you unsubscribe/i, /suppression list/i, /delete/i],
    sk: [/záznamy servera/i, /nenastavuje sledovacie ani reklamné cookies/i, /predvolene vypnutá/i, /čakacia listina/i, /kým sa neodhlásite/i, /zozname vylúčených/i, /vymazať/i],
  };
  for (const locale of ["en", "sk"] as const) {
    const all = leaves(getLegalMessages(locale).privacy).map(([, v]) => v).join("\n");
    for (const topic of topics[locale]) expect(all, `${locale} ${topic}`).toMatch(topic);
  }
});

it.each([["en"], ["sk"]] as const)("renders each legal page with the operator block and a TODO marker in %s", (locale) => {
  expect(operatorIsPlaceholder()).toBe(true);
  for (const doc of docs) {
    const html = renderToStaticMarkup(LegalPage({ locale, doc }));
    expect(html).toContain(getLegalMessages(locale).short);
    if (doc === "disclaimer") continue;
    for (const field of OPERATOR_FIELDS) expect(html).toContain(OPERATOR[field]);
    expect(html).toContain("TODO");
  }
});

it("keeps every operator field a TODO until the owner fills it in", () => {
  for (const field of OPERATOR_FIELDS) expect(OPERATOR[field]).toMatch(/^TODO/);
  expect(operatorIsPlaceholder({ name: "A", address: "B", contactEmail: "c@d.test", companyId: "1" })).toBe(false);
});

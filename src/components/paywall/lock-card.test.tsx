import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlusLock } from "./lock-card";

const base = { badge: "Plus", title: "CSV export", note: "Download the scanner table as a file.", action: { href: "/en/pricing#plus", label: "See what Plus includes" } };

it("prints the word Plus in every form and links to the plan", () => {
  const forms = [
    <PlusLock key="c" {...base} form="control" control={<select disabled />} />,
    <PlusLock key="d" {...base} form="depth" summary="Showing 90 days of 400 days."><p>sample</p></PlusLock>,
    <PlusLock key="t" {...base} form="teaser" sampleLabel="Sample"><p>row</p></PlusLock>,
    <PlusLock key="k" {...base} form="card" />,
  ];
  for (const node of forms) {
    const html = renderToStaticMarkup(node);
    expect(html).toContain("<span>Plus</span>");
    expect(html).toContain('href="/en/pricing#plus"');
    expect(html).not.toMatch(/<dialog|blur|countdown/i);
  }
});

it("marks the disabled control and the teaser sample", () => {
  expect(renderToStaticMarkup(<PlusLock {...base} form="control" control={<select disabled />} />)).toContain('aria-disabled="true"');
  expect(renderToStaticMarkup(<PlusLock {...base} form="teaser" sampleLabel="Sample"><p>row</p></PlusLock>)).toContain('class="stamp">Sample<');
});

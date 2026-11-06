import { describe, expect, it } from "vitest";
import { extractPageDate, findQuote, htmlToText, normalizeText } from "./html-text";

describe("htmlToText", () => {
  it("drops script, style, noscript, iframe, svg, template and comments", () => {
    const text = htmlToText("<p>Keep</p><script>var a='Secret one'</script><style>.x{}</style><noscript>Secret two</noscript><iframe>Secret three</iframe><svg><text>Secret four</text></svg><template>Secret five</template><!-- Secret six --><p>End</p>");
    expect(text.split(/\s+/)).toEqual(["Keep", "End"]);
  });
  it("drops hidden elements and what is inside them", () => {
    const text = htmlToText('<div>Shown</div><div style="display:none">Hidden a<span>Hidden b</span></div><p hidden>Hidden c</p><p aria-hidden="true">Hidden d</p><div>After</div>');
    expect(text.split(/\s+/)).toEqual(["Shown", "After"]);
  });
  it("decodes entities and collapses whitespace", () => {
    expect(htmlToText("<p>Revenue&nbsp;was  &pound;4.2&nbsp;billion &amp;\n up &#8364;1 &#x41;</p>").replace(/\s+/g, " ")).toBe("Revenue was £4.2 billion & up €1 A");
  });
  it("does not find a quote that sits only in script or a hidden div", () => {
    const quote = "Company expects revenue of 4.2 billion dollars";
    const page = htmlToText(`<script>"${quote}"</script><div hidden>${quote}</div><p>Other text</p>`);
    expect(findQuote(page, quote)).toBeNull();
  });
});

describe("findQuote", () => {
  const long = "The company said full year revenue is now expected to be between 4.1 and 4.3 billion dollars, up from the earlier range given in May.";
  it("matches exactly after quote, dash and whitespace normalisation, keeping case", () => {
    expect(findQuote("He said “growth  is strong” — really", 'growth is strong')?.match).toBe("exact");
    expect(findQuote("Growth is strong", "growth is strong")).toBeNull();
    expect(normalizeText("a  b​")).toBe("a b");
  });
  it("matches fuzzily with up to 3 differing characters in a long quote", () => {
    const page = `Intro. ${long.replace("earlier range", "earliar rangee")} Outro.`;
    const found = findQuote(page, long);
    expect(found?.match).toBe("fuzzy");
  });
  it("never matches when a figure is altered", () => {
    expect(findQuote(`Intro. ${long.replace("4.3 billion", "4.8 billion")}`, long)).toBeNull();
    expect(findQuote(`Intro. ${long.replace("4.1", "41")}`, long)).toBeNull();
  });
  it("does not use fuzzy matching below 80 characters, or past 3 edits", () => {
    expect(findQuote("revenue of 4.1 billion doller", "revenue of 4.1 billion dollar")).toBeNull();
    expect(findQuote(`x ${long.replace("expected", "xpcted").replace("between", "betwen").replace("given", "gven")}`, long)).toBeNull();
  });
});

describe("extractPageDate", () => {
  it("reads meta, JSON-LD and time tags", () => {
    expect(extractPageDate('<meta property="article:published_time" content="2026-09-01T10:00:00Z">')).toBe("2026-09-01");
    expect(extractPageDate('<script type="application/ld+json">{"datePublished":"2026-08-02"}</script>')).toBe("2026-08-02");
    expect(extractPageDate('<time datetime="2026-07-03">x</time>')).toBe("2026-07-03");
    expect(extractPageDate("<p>none</p>")).toBeNull();
  });
});

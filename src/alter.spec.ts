import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
  closeMatch,
  coverUrls,
  dropAltCaptions,
  exactMatch,
  type MimeData,
  parseSrcset,
  resolveByline,
  shrinkSubstitutes,
  unwrapLinks,
} from "./alter";
import { substituted, substituteScale } from "./glyphs";

function parseBody(html: string): Document {
  const { window } = new JSDOM(
    `<!doctype html><html><body>${html}</body></html>`,
  );
  const { document } = window;
  globalThis.HTMLMetaElement = window.HTMLMetaElement;
  return document as unknown as Document;
}

function asset(name: string): MimeData {
  return { data: new TextEncoder().encode(name), mime: "image/png" };
}

test("resolveByline() drops a byline that repeats the declared authors", () => {
  const author =
    "Ann Alpha, Ben Bravo, Cara Charlie, Dan Delta, Eve Echo, Fay Foxtrot, Gil Golf, Hal Hotel";
  const byline =
    "Ann Alpha,Ben Bravo,Cara Charlie,Dan Delta,Eve Echo,Fay Foxtrot,Gil Golf,Hal Hotel";
  expect(resolveByline(author, byline)).toBe(author);
});

test("resolveByline() keeps authors only the byline names", () => {
  expect(resolveByline("Jane Doe", "Jane Doe, Bob Roe")).toBe(
    "Jane Doe. Bob Roe",
  );
  expect(resolveByline("Jane Doe, Bob Roe", "Jane Doe, Bob Roe, Sue Lin")).toBe(
    "Jane Doe, Bob Roe. Sue Lin",
  );
});

test("resolveByline() matches names regardless of case or spacing", () => {
  expect(resolveByline("Jane Doe", "JANE  DOE, Bob Roe")).toBe(
    "Jane Doe. Bob Roe",
  );
});

test("resolveByline() keeps an unrelated byline whole", () => {
  expect(resolveByline("Jane Doe", "Bob Roe")).toBe("Jane Doe. Bob Roe");
});

test("resolveByline() never splits the byline itself", () => {
  expect(resolveByline("Jane Doe", "Jane Doe, staff writer")).toBe(
    "Jane Doe. staff writer",
  );
  expect(resolveByline(null, "Doe, Jane")).toBe("Doe, Jane");
});

test("resolveByline() removes longer names before their substrings", () => {
  expect(
    resolveByline("Jane Doe, Jane Doe Smith", "Jane Doe Smith, Bob Roe"),
  ).toBe("Jane Doe, Jane Doe Smith. Bob Roe");
});

test("resolveByline() escapes regex characters in names", () => {
  expect(resolveByline("A. B. Smith Jr.", "A. B. Smith Jr., Bob Roe")).toBe(
    "A. B. Smith Jr.. Bob Roe",
  );
});

test("resolveByline() tidies leftover whitespace and commas", () => {
  expect(resolveByline("Jane Doe", "Jane  Doe ,, , Bob Roe ,")).toBe(
    "Jane Doe. Bob Roe",
  );
});

test("resolveByline() falls back to whichever source exists", () => {
  expect(resolveByline("Jane Doe", undefined)).toBe("Jane Doe");
  expect(resolveByline(null, "Bob Roe")).toBe("Bob Roe");
  expect(resolveByline(null, undefined)).toBeUndefined();
});

test("unwrapLinks() keeps link text when filtering links", () => {
  const doc = parseBody(
    `<p>see <a href="https://ex.com/a">the show</a> now</p>`,
  );
  unwrapLinks(doc, true);
  expect(doc.querySelectorAll("a").length).toBe(0);
  expect(doc.body.textContent).toBe("see the show now");
});

test("unwrapLinks() leaves ordinary links alone when not filtering", () => {
  const doc = parseBody(
    `<p>see <a href="https://ex.com/a">the show</a> now</p>`,
  );
  unwrapLinks(doc, false);
  expect(doc.querySelectorAll("a").length).toBe(1);
});

test("unwrapLinks() keeps fragment links for footnote handling", () => {
  const doc = parseBody(`<p>claim<sup><a href="#fn1">1</a></sup></p>`);
  unwrapLinks(doc, true);
  expect(doc.querySelector(`a[href="#fn1"]`)).not.toBeNull();
});

test("unwrapLinks() unwraps sponsored links inside prose even when not filtering", () => {
  const doc = parseBody(
    `<p>the museum’s “<a rel="sponsored" href="https://ex.com/x">Show Title</a>” opens soon</p>`,
  );
  unwrapLinks(doc, false);
  expect(doc.querySelectorAll("a").length).toBe(0);
  expect(doc.body.textContent).toContain("“Show Title”");
});

test("unwrapLinks() leaves standalone sponsored links for defuddle to drop", () => {
  const doc = parseBody(
    `<ul><li><a rel="sponsored" href="https://ex.com/ad">Buy this thing</a></li></ul>`,
  );
  unwrapLinks(doc, true);
  expect(doc.querySelectorAll("a").length).toBe(1);
});

test("unwrapLinks() sees through inline wrappers around sponsored links", () => {
  const doc = parseBody(
    `<p>reviewed <em><a rel="SPONSORED" href="https://ex.com/x">Show Title</a></em> last night</p>`,
  );
  unwrapLinks(doc, false);
  expect(doc.querySelectorAll("a").length).toBe(0);
  expect(doc.body.textContent).toBe("reviewed Show Title last night");
});

test("parseSrcset() yields each candidate url", () => {
  expect([...parseSrcset("a.png 1x, b.png 2x")]).toEqual(["a.png", "b.png"]);
  expect([...parseSrcset("  a.png  ")]).toEqual(["a.png"]);
  expect([...parseSrcset("a.png,, b.png")]).toEqual(["a.png", "b.png"]);
  expect([...parseSrcset("")]).toEqual([]);
});

test("coverUrls() yields cover candidates in document order", () => {
  const doc = parseBody(
    `<meta property="twitter:image" content="tw.png">
     <meta property="og:image" content="og.png">
     <meta property="og:description" content="nope">`,
  );
  expect([...coverUrls(doc)]).toEqual(["tw.png", "og.png"]);
});

test("exactMatch() returns the first href present in the assets", () => {
  const assets = new Map([["b.png", asset("b")]]);
  const match = exactMatch(assets);
  expect(match(["a.png", "b.png"])?.[0]).toBe("b.png");
  expect(match(["a.png"])).toBeUndefined();
});

test("closeMatch() picks the nearest asset within the threshold", () => {
  const assets = new Map([
    ["https://ex.com/photo.png", asset("photo")],
    ["https://ex.com/unrelated-image-name.png", asset("other")],
  ]);
  expect(closeMatch(assets, 0.3)(["https://ex.com/photo.png?w=100"])?.[0]).toBe(
    "https://ex.com/photo.png",
  );
  expect(
    closeMatch(assets, 0.01)(["https://ex.com/photo.png?w=100"]),
  ).toBeUndefined();
});

test("dropAltCaptions() removes a caption that only repeats the alt text", () => {
  const doc = parseBody(
    `<figure><img src="chart.png" alt="A bar chart" /><figcaption>A bar chart</figcaption></figure>`,
  );
  dropAltCaptions(doc.body);
  expect(doc.querySelector("figcaption")).toBeNull();
  expect(doc.querySelector("img")?.alt).toBe("A bar chart");
});

test("dropAltCaptions() ignores whitespace differences", () => {
  const doc = parseBody(
    `<figure><img src="chart.png" alt="A bar\nchart" /><figcaption>  A bar chart </figcaption></figure>`,
  );
  dropAltCaptions(doc.body);
  expect(doc.querySelector("figcaption")).toBeNull();
});

test("dropAltCaptions() keeps a caption that says something else", () => {
  const doc = parseBody(
    `<figure><img src="chart.png" alt="A bar chart" /><figcaption>Figure 1. Deficits by year.</figcaption></figure>`,
  );
  dropAltCaptions(doc.body);
  expect(doc.querySelector("figcaption")?.textContent).toBe(
    "Figure 1. Deficits by year.",
  );
});

test("dropAltCaptions() keeps captions on images without alt text", () => {
  const doc = parseBody(
    `<figure><img src="chart.png" /><figcaption>A bar chart</figcaption></figure>`,
  );
  dropAltCaptions(doc.body);
  expect(doc.querySelector("figcaption")?.textContent).toBe("A bar chart");
});

test("shrinkSubstitutes() wraps characters the font can't draw", () => {
  const doc = parseBody(`<p>as they are humane. \u2666</p>`);
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  expect(doc.querySelector("span.repub-substitute")?.textContent).toBe(
    "\u2666",
  );
  expect(doc.querySelector("p")?.textContent).toBe(
    "as they are humane. \u2666",
  );
});

test("shrinkSubstitutes() leaves characters the font has alone", () => {
  const doc = parseBody(
    `<p>an em dash \u2014 a bullet \u2022 an ellipsis \u2026</p>`,
  );
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  expect(doc.querySelector("span")).toBeNull();
});

test("shrinkSubstitutes() groups runs and keeps the surrounding text", () => {
  const doc = parseBody(`<p>arrows \u2192\u2192 and back</p>`);
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  const spans = doc.querySelectorAll("span.repub-substitute");
  expect(spans.length).toBe(1);
  expect(spans[0]?.textContent).toBe("\u2192\u2192");
  expect(doc.querySelector("p")?.textContent).toBe(
    "arrows \u2192\u2192 and back",
  );
});

test("shrinkSubstitutes() follows the chosen font", () => {
  const doc = parseBody(`<p>an arrow \u2192</p>`);
  shrinkSubstitutes(doc.body, substituted("dynamic", "EB Garamond"));
  expect(doc.querySelector("span")).toBeNull();
});

test("shrinkSubstitutes() shrinks what any font might lack when fitting any font", () => {
  const doc = parseBody(`<p>an arrow \u2192 a diamond \u2666</p>`);
  shrinkSubstitutes(doc.body, substituted("robust", "EB Garamond"));
  const spans = doc.querySelectorAll("span.repub-substitute");
  expect(spans.length).toBe(2);
});

test("substituteScale() only fits the chosen font when asked", () => {
  expect(substituteScale("dynamic", "reMarkable Serif Small")).toBeCloseTo(
    0.75,
  );
  expect(substituteScale("dynamic", "EB Garamond")).toBeCloseTo(0.85);
  expect(substituteScale("dynamic", "")).toBeCloseTo(0.75);
  expect(substituteScale("robust", "EB Garamond")).toBeCloseTo(0.75);
});

test("shrinkSubstitutes() leaves a passage in a script the font lacks alone", () => {
  const doc = parseBody(
    `<p>\u041f\u0440\u0438\u0432\u0435\u0442 \u043c\u0438\u0440, \u044d\u0442\u043e \u0442\u0435\u043a\u0441\u0442</p>`,
  );
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  expect(doc.querySelector("span")).toBeNull();
});

test("shrinkSubstitutes() judges each block on its own", () => {
  const doc = parseBody(
    `<p>\u65e5\u672c\u8a9e\u306e\u30c6\u30ad\u30b9\u30c8</p><p>as they are humane. \u2666</p>`,
  );
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  const spans = doc.querySelectorAll("span.repub-substitute");
  expect(spans.length).toBe(1);
  expect(spans[0]?.textContent).toBe("\u2666");
});

test("shrinkSubstitutes() leaves fixed-width text alone", () => {
  const doc = parseBody(
    `<pre>tree\n\u251c\u2500\u2500 src\n\u2514\u2500\u2500 test</pre>`,
  );
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  expect(doc.querySelector("span")).toBeNull();
});

test("substituteScale() ignores inherited property names", () => {
  expect(substituteScale("dynamic", "toString")).toBeCloseTo(0.75);
});

test("shrinkSubstitutes() still shrinks a short line with a stray symbol", () => {
  const doc = parseBody(`<li>A → B</li>`);
  shrinkSubstitutes(doc.body, substituted("dynamic", "reMarkable Serif Small"));
  expect(doc.querySelector("span.repub-substitute")?.textContent).toBe("→");
});

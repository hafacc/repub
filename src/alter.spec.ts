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
  unwrapLinks,
} from "./alter";

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

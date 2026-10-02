import Defuddle from "defuddle";
import leven from "leven";
import type { ImageMime } from "./epub";
import { type ShrinkMode, substituted } from "./glyphs";
import type { ImageHandling } from "./options";

/** a generic "file" */
export interface MimeData {
  readonly data: Uint8Array;
  readonly mime: string;
}

/** something that finds matches */
export type UrlMatcher = (
  iter: Iterable<string>,
) => [string, MimeData] | undefined;

/** only valid if matches exactly, relatively efficient */
export function exactMatch(assetData: Map<string, MimeData>): UrlMatcher {
  return (hrefs: Iterable<string>): [string, MimeData] | undefined => {
    for (const href of hrefs) {
      const data = assetData.get(href);
      if (data) {
        return [href, data];
      }
    }
  };
}

/**
 * looks for close matches
 *
 * This currently scans all possible urls (slowly) and finds the one with the
 * smallest normalized edit distance in all of the queries.
 *
 * @remarks This currently does raw url matching instead of doing matching
 * based off of the semantics of the url, e.g. putting more emphasis on domain
 * over the rest of the url, or ignoring ordering of parameters. It's not clear
 * how much this advanced similarity is necessary.
 *
 * @param thresh - the normalized edit distance threshold. 0 indicates a
 * complete match (for which this function will be inefficient). 1 indicates
 * anything matches and so it will always select an image.
 */
// NOTE this seems only necessary due to this bug:
// https://bugs.chromium.org/p/chromium/issues/detail?id=1323522
export function closeMatch(
  assetData: Map<string, MimeData>,
  thresh: number,
): UrlMatcher {
  /* NOTE this could be better if we actually parsed the hrefs and looked at
   * differences there so that ordering of query parameters wouldn't affect it,
   * etc. */
  return (hrefs: Iterable<string>): [string, MimeData] | undefined => {
    let match: [string, MimeData] | undefined;
    let score = thresh;
    for (const href of hrefs) {
      for (const [test, val] of assetData) {
        const dist = leven(href, test) / Math.max(href.length, test.length);
        if (dist < score) {
          score = dist;
          match = [test, val];
        }
      }
    }
    return match;
  };
}

export interface Altered {
  altered: string;
  title: string;
  byline?: string;
  cover?: string | undefined;
  seen: Set<string>;
  images: [string, Uint8Array, ImageMime][];
}

export function* parseSrcset(srcset: string): IterableIterator<string> {
  for (const field of srcset.split(",")) {
    const match = /\S+/.exec(field);
    if (!match) continue;
    const [href] = match;
    yield href;
  }
}

function* getSrcs(nodes: Iterable<Node>): IterableIterator<string> {
  for (const node of nodes) {
    if (node instanceof Element) {
      for (const { name, value } of node.attributes) {
        if (name === "src") {
          yield value;
        } else if (name === "srcset") {
          yield* parseSrcset(value);
        }
      }
    }
  }
}

interface WalkOptions {
  filterLinks: boolean;
  filterIframes: boolean;
  imageHandling: ImageHandling;
  convertTables: boolean;
  rotateTables: boolean;
  tableResolution: number;
  tableCss: string;
}

interface Options extends WalkOptions {
  authorByline: boolean;
  // the document's original url, used to resolve relative hrefs
  url: string;
  shrinkGlyphs: ShrinkMode;
  // the tablet font we're rendering for, which decides what it can draw
  fontName: string;
}

class Walker {
  readonly seen = new Set<string>();
  readonly svgs = new Map<string, string>();
  readonly pngs: [string, Uint8Array][] = [];

  constructor(
    private match: UrlMatcher,
    private options: WalkOptions,
  ) {}

  async *#walk(node: Node): AsyncIterableIterator<Node> {
    // istanbul ignore if
    if (node instanceof DocumentType) {
      // <!doctype ...> node should never actually find
      throw new Error("internal error: should never get a doctype element");
    } else if (node instanceof Text) {
      // preserve these
      yield node;
    } else if (node instanceof HTMLAnchorElement && this.options.filterLinks) {
      // remove link leaving just children
      for (const child of [...node.childNodes]) {
        yield* this.#walk(child);
      }
    } else if (node instanceof SVGElement) {
      /* remarkable can't seem to handle inline svgs, so we remap them to
       * "external" svgs */
      const serial = new XMLSerializer();
      const encoded = serial.serializeToString(node);
      const rep = `<?xml version="1.0" encoding="utf-8"?>${encoded}`;
      let url = this.svgs.get(rep);
      if (url === undefined) {
        url = `inlinesvg://${this.svgs.size}.svg`;
        this.svgs.set(rep, url);
      }
      const img = new Image();
      img.src = url;
      yield img;
    } else if (node instanceof HTMLTableElement && this.options.convertTables) {
      const div = document.createElement("div");
      document.body.appendChild(div);
      // we attach a shadow dom to prevent styles from affecting rendering
      const shadow = div.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.innerHTML = `
table {
  font-size: initial;
  font-family: sans-serif;
}
    
${this.options.tableCss}`;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      shadow.appendChild(svg);
      svg.appendChild(style);
      const fo = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "foreignObject",
      );
      fo.setAttribute("width", "100%");
      fo.setAttribute("height", "100%");
      svg.appendChild(fo);
      const xhtmldiv = document.createElement("div");
      fo.appendChild(xhtmldiv);
      xhtmldiv.appendChild(node);
      const { width, height } = node.getBoundingClientRect();
      document.body.removeChild(div);

      svg.setAttribute("width", width.toFixed());
      svg.setAttribute("height", height.toFixed());

      const serial = new XMLSerializer();
      const render = new Image();
      await new Promise((resolve, reject) => {
        render.addEventListener("load", resolve);
        render.addEventListener("error", () => {
          reject(new Error("failed to render table image"));
        });
        render.src = `data:image/svg+xml,${encodeURIComponent(
          serial.serializeToString(svg),
        )}`;
      });

      const canvasWidth = width * this.options.tableResolution;
      const canvasHeight = height * this.options.tableResolution;
      const rotate = this.options.rotateTables && width > height;
      const canvas = new OffscreenCanvas(
        rotate ? canvasHeight : canvasWidth,
        rotate ? canvasWidth : canvasHeight,
      );
      const ctx = canvas.getContext("2d")!;
      if (rotate) {
        ctx.translate(canvasHeight / 2, canvasWidth / 2);
        ctx.rotate(-Math.PI / 2);
      } else {
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
      }
      ctx.drawImage(
        render,
        -canvasWidth / 2,
        -canvasHeight / 2,
        canvasWidth,
        canvasHeight,
      );

      const blob = await canvas.convertToBlob({ type: "image/png" });
      const bytes = await blob.arrayBuffer();

      const url = `tableimage://${this.pngs.length}.png`;
      this.pngs.push([url, new Uint8Array(bytes)]);

      const img = new Image();
      img.src = url;
      yield img;
    } else if (node instanceof HTMLIFrameElement) {
      const match = this.options.filterIframes
        ? undefined
        : this.match([node.src]);
      if (match) {
        const [, { data, mime }] = match;
        const decoder = new TextDecoder();
        const parser = new DOMParser();
        if (mime !== "text/html") throw new Error("unexpected mime");
        const contents = parser.parseFromString(decoder.decode(data), mime);
        for (const child of contents.body.childNodes) {
          yield* this.#walk(child);
        }
      }
    } else if (node instanceof HTMLImageElement) {
      // img element, find best src
      const { imageHandling } = this.options;
      const [href] = this.match(getSrcs([node])) ?? [];
      if (imageHandling === "strip") {
        // noop
      } else if (!href) {
        console.warn("no src match found for", node);
      } else if (imageHandling !== "filter" || !this.seen.has(href)) {
        node.src = href;
        this.seen.add(href);
        yield node;
      }
    } else if (node instanceof HTMLPictureElement) {
      // picture element, find best source and set pictures source
      const { imageHandling } = this.options;
      const [href] = this.match(getSrcs(node.childNodes)) ?? [];
      let img: HTMLImageElement | undefined;
      for (const child of node.childNodes) {
        if (child instanceof HTMLImageElement) {
          img = child;
          break;
        }
      }
      if (imageHandling === "strip") {
        // no op
      } else if (!href) {
        console.warn("no src match found for", node);
      } else if (!img) {
        console.warn("no img inside picture element", node);
      } else if (imageHandling !== "filter" || !this.seen.has(href)) {
        img.src = href;
        this.seen.add(href);
        yield img;
      }
    } else {
      // all others
      const newChildren = [];
      // snapshot: #walk may reparent a child
      for (const child of [...node.childNodes]) {
        for await (const walked of this.#walk(child)) {
          newChildren.push(walked);
        }
      }

      if (
        newChildren.length !== node.childNodes.length ||
        newChildren.some((child, i) => child !== node.childNodes[i])
      ) {
        let child: Node | null;
        while ((child = node.firstChild)) {
          node.removeChild(child);
        }
        for (const child of newChildren) {
          node.appendChild(child);
        }
      }

      yield node;
    }
  }

  async walk(node: Node): Promise<this> {
    for await (const _ of this.#walk(node)) {
      void _;
    }
    return this;
  }
}

export function* coverUrls(doc: Document): IterableIterator<string> {
  const coverMeta = doc.querySelectorAll(
    `meta[property="og:image"], meta[property="og:image:url"], meta[property="twitter:image"]`,
  );
  for (const meta of coverMeta) {
    if (meta instanceof HTMLMetaElement) {
      yield meta.content;
    }
  }
}

interface Summary {
  content: HTMLElement;
  title: string | undefined;
  byline: string | undefined;
}

const inlineTags = new Set([
  "A",
  "ABBR",
  "B",
  "CITE",
  "CODE",
  "EM",
  "I",
  "MARK",
  "S",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "U",
]);

/** whether an element sits among text rather than making up its whole block */
function inProse(elem: Element): boolean {
  let inline = elem;
  while (inline.parentElement && inlineTags.has(inline.parentElement.tagName)) {
    inline = inline.parentElement;
  }
  const block = inline.parentElement;
  return (
    !!block &&
    (block.textContent ?? "").replace(inline.textContent ?? "", "").trim()
      .length > 0
  );
}

/** unwrap links so defuddle can't strip or pad the text inside them */
export function unwrapLinks(doc: Document, filterLinks: boolean): void {
  for (const anchor of doc.querySelectorAll("a")) {
    const sponsored = anchor.matches(`[rel="sponsored" i]`);
    if (
      (filterLinks || sponsored) &&
      (!sponsored || inProse(anchor)) &&
      // defuddle reconstructs footnotes from these
      !(anchor.getAttribute("href") ?? "").startsWith("#")
    ) {
      anchor.replaceWith(...anchor.childNodes);
    }
  }
}

function collapsed(text: string | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** drop captions defuddle invents from an image's alt text */
export function dropAltCaptions(content: HTMLElement): void {
  for (const figure of content.querySelectorAll("figure")) {
    const caption = figure.querySelector(":scope > figcaption");
    const alt = figure.querySelector<HTMLImageElement>(":scope > img")?.alt;
    if (caption && alt && collapsed(alt) === collapsed(caption.textContent)) {
      caption.remove();
    }
  }
}

/** group adjacent characters that the tablet treats the same way */
function* runs(
  text: string,
  substituted: (char: string) => boolean,
): IterableIterator<[string, boolean]> {
  let run = "";
  let subbed = false;
  for (const char of text) {
    const sub = substituted(char);
    if (run && sub !== subbed) {
      yield [run, subbed];
      run = "";
    }
    run += char;
    subbed = sub;
  }
  if (run) {
    yield [run, subbed];
  }
}

const blockTags = new Set([
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DT",
  "FIGCAPTION",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "PRE",
  "TD",
  "TH",
]);

// where the substitute is more the block's font than an intruder in it, as in
// a paragraph of a script the font doesn't have, its spacing is already even
// and shrinking would only make the block small
const MAX_SUBSTITUTED = 0.5;

function block(text: Text, root: HTMLElement): Element {
  let elem = text.parentElement;
  while (elem && elem !== root && !blockTags.has(elem.tagName)) {
    elem = elem.parentElement;
  }
  return elem ?? root;
}

/**
 * shrink characters the tablet's font can't draw
 *
 * The substitute font it reaches for is tall enough that one character adds a
 * quarter to the line spacing of every line in its paragraph. The size that
 * undoes that depends on the font, so the span only gets a class here and
 * {@link substituteScale} sets the size.
 */
export function shrinkSubstitutes(
  content: HTMLElement,
  substituted: (char: string) => boolean,
): void {
  const doc = content.ownerDocument;
  const texts = new Map<Element, Text[]>();
  const walker = doc.createTreeWalker(content, 0x4 /* NodeFilter.SHOW_TEXT */);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    // fixed-width text lines up column by column, so leave it at one size
    if (text.parentElement?.closest("pre, code")) {
      continue;
    }
    const parent = block(text, content);
    const group = texts.get(parent);
    if (group) {
      group.push(text);
    } else {
      texts.set(parent, [text]);
    }
  }

  for (const group of texts.values()) {
    const split = group.map((text) => [...runs(text.data, substituted)]);
    let subbed = 0;
    let total = 0;
    for (const runList of split) {
      for (const [run, sub] of runList) {
        const chars = [...run].filter((char) => !!char.trim()).length;
        total += chars;
        if (sub) {
          subbed += chars;
        }
      }
    }
    if (!subbed || subbed > total * MAX_SUBSTITUTED) {
      continue;
    }
    for (const [index, text] of group.entries()) {
      const runList = split[index]!;
      if (!runList.some(([, sub]) => sub)) {
        continue;
      }
      const frag = doc.createDocumentFragment();
      for (const [run, sub] of runList) {
        if (sub) {
          const span = doc.createElement("span");
          span.className = "repub-substitute";
          span.textContent = run;
          frag.append(span);
        } else {
          frag.append(doc.createTextNode(run));
        }
      }
      text.replaceWith(frag);
    }
  }
}

/** extract the main content of a document as a detached element */
function summarizeDoc(
  doc: Document,
  url: string,
  filterLinks: boolean,
): Summary {
  unwrapLinks(doc, filterLinks);
  const { content, title, author } = new Defuddle(doc, { url }).parse();
  const parser = new DOMParser();
  const body = parser.parseFromString(content, "text/html").body;
  dropAltCaptions(body);
  return {
    content: body,
    title: title || undefined,
    byline: author || undefined,
  };
}

/** drop authors already named in `author` from a byline */
function trimByline(byline: string, author: string): string {
  const names = author
    .split(",")
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => name.length)
    .sort((left, right) => right.length - left.length);
  let trimmed = byline.replace(/\s+/g, " ");
  for (const name of names) {
    trimmed = trimmed.replace(new RegExp(RegExp.escape(name), "gi"), "");
  }
  return trimmed
    .replace(/\s+/g, " ")
    .replace(/(?:\s*,)+/g, ", ")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "");
}

/** combine declared authors with whatever the byline adds beyond them */
export function resolveByline(
  author: string | null,
  byline: string | undefined,
): string | undefined {
  const remaining = author && byline ? trimByline(byline, author) : byline;
  if (author && remaining) {
    return `${author}. ${remaining}`;
  } else {
    return author ?? remaining ?? undefined;
  }
}

/** update img src's with srcset information */
export async function alter(
  doc: Document,
  match: UrlMatcher,
  { authorByline, url, shrinkGlyphs, fontName, ...opts }: Options,
  summarize: boolean = true,
): Promise<Altered> {
  const [cover] = match(coverUrls(doc)) ?? [];
  const authors = authorByline
    ? [...doc.querySelectorAll(`meta[property="article:author"]`)]
        .filter(
          (meta): meta is HTMLMetaElement => meta instanceof HTMLMetaElement,
        )
        .map((meta) => meta.content.trim())
        .filter((content) => content.length && !URL.canParse(content))
        .map((content) => content.replace(/,\s*/g, ", "))
    : [];
  const author = authors.length ? authors.join(", ") : null;

  const { content, title, byline } = summarize
    ? summarizeDoc(doc, url, opts.filterLinks)
    : { content: doc.body, title: undefined, byline: undefined };
  const { seen, svgs, pngs } = await new Walker(match, opts).walk(content);
  const images: [string, Uint8Array, ImageMime][] = [];
  const enc = new TextEncoder();
  for (const [data, url] of svgs) {
    images.push([url, enc.encode(data), "image/svg+xml"]);
  }
  for (const [url, data] of pngs) {
    images.push([url, data, "image/png"]);
  }

  if (shrinkGlyphs !== "off") {
    shrinkSubstitutes(content, substituted(shrinkGlyphs, fontName));
  }

  const serial = new XMLSerializer();
  return {
    altered: serial.serializeToString(content),
    title: title ?? "unknown title",
    byline: resolveByline(author, byline),
    cover,
    seen,
    images,
  };
}

import { alter, closeMatch, exactMatch, type MimeData } from "./alter";
import { epub, type ImageData, type ImageMime } from "./epub";
import { type ShrinkMode, substituteScale } from "./glyphs";
import type { EpubOptions } from "./options";
import { parse } from "./parse";

const remarkableCss = `
p {
  margin-top: 1em;
  margin-bottom: 1em;
}

ul, ol {
  padding: 1em;
}

ul li, ol li {
  margin-left: 1.5em;
  padding-left: 0.5em;
}

figcaption {
  font-size: 0.5rem;
  font-style: italic;
}
`;

function substituteCss(mode: ShrinkMode, fontName: string): string {
  return `
.repub-substitute {
  font-size: ${substituteScale(mode, fontName)}em;
}
`;
}

const codeEnvironmentCss = `
pre, code {
  font-family: "Noto Mono", monospace;
  font-size: 0.8em;
  background-color: #f2f2f2;
}

pre {
  white-space: pre-wrap;
  /* this doesn't work, but it might as some point */
  text-align: left !important;
}
`;

const baseTableCss = `
table, th, td {
  border: 1px solid;
}

th {
  border-top: 3px solid;
  border-bottom: 3px solid;
}

th, td {
  padding: 0.25rem;
}

table {
  border-bottom: 3px solid;
  border-collapse: collapse;
}
`;

const tableCss = `
${baseTableCss}

table {
  max-width: 100%;
}
`;

type Brighten = (
  buffer: Uint8Array,
  mime: string,
) => Promise<readonly [Uint8Array, ImageMime]>;

interface Result {
  initial: string;
  altered: string;
  assets: Map<string, MimeData>;
  brightened: Map<string, ImageData>;
  epub: Uint8Array;
  title?: string;
}

export async function generate(
  mhtml: Uint8Array,
  brighten: Brighten,
  {
    imageHrefSimilarityThreshold,
    imageHandling,
    filterLinks,
    filterIframes,
    authorByline,
    rmCss,
    codeCss,
    tabCss,
    hrefHeader,
    bylineHeader,
    coverHeader,
    convertTables,
    rotateTables,
    tableResolution,
    shrinkGlyphs,
    fontName,
  }: EpubOptions,
  summarize: boolean,
  initTitle?: string,
  initAuthor?: string,
): Promise<Result> {
  const { href, content, assets } = await parse(mhtml);
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");

  const assetData = new Map<string, MimeData>();
  for await (const { href, content: data, contentType, contentId } of assets) {
    if (contentType.startsWith("image/")) {
      assetData.set(href, { mime: contentType, data });
    } else if (
      contentType === "text/html" &&
      contentId &&
      contentId.startsWith("<") &&
      contentId.endsWith(">")
    ) {
      const cid = `cid:${contentId.slice(1, -1)}`;
      assetData.set(cid, { mime: contentType, data });
    }
  }

  const matcher =
    imageHrefSimilarityThreshold > 0
      ? closeMatch(assetData, imageHrefSimilarityThreshold)
      : exactMatch(assetData);
  const { altered, title, byline, cover, seen, images } = await alter(
    doc,
    matcher,
    {
      filterLinks,
      imageHandling,
      authorByline,
      filterIframes,
      url: href,
      convertTables,
      rotateTables,
      tableResolution,
      tableCss: tabCss ? baseTableCss : "",
      shrinkGlyphs,
      fontName,
    },
    summarize,
  );

  if (cover && coverHeader) {
    seen.add(cover);
  }

  const proms = [];
  for (const href of seen) {
    const { mime, data } = assetData.get(href)!;
    proms.push(
      brighten(data, mime).then(
        ([data, mime]) => [href, data, mime] as const,
        (err: unknown) => {
          console.warn(`problem brightening ${href}:`, err);
          return null;
        },
      ),
    );
  }

  const brightened = new Map<string, ImageData>();
  for (const res of await Promise.all(proms)) {
    if (res) {
      const [href, data, mime] = res;
      brightened.set(decodeURIComponent(href), { data, mime });
    }
  }
  for (const [url, data, mime] of images) {
    brightened.set(url, { data, mime });
  }

  const buffer = await epub({
    title: initTitle ?? title,
    content: altered,
    author: initAuthor ?? byline,
    images: brightened,
    css: `${rmCss ? remarkableCss : ""} ${shrinkGlyphs === "off" ? "" : substituteCss(shrinkGlyphs, fontName)} ${codeCss ? codeEnvironmentCss : ""}  ${tabCss ? tableCss : ""}`,
    href: hrefHeader ? href : undefined,
    byline: bylineHeader,
    cover: coverHeader ? cover : undefined,
  });
  return {
    epub: buffer,
    title: initTitle ?? title,
    initial: content,
    altered,
    brightened,
    assets: assetData,
  };
}

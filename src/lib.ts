import { alter, closeMatch, exactMatch, type MimeData } from "./alter";
import { baseTableCss, epubCss } from "./css";
import { epub, type ImageData, type ImageMime } from "./epub";
import type { EpubOptions } from "./options";
import { parse } from "./parse";

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
  options: EpubOptions,
  summarize: boolean,
  initTitle?: string,
  initAuthor?: string,
): Promise<Result> {
  const {
    imageHrefSimilarityThreshold,
    imageHandling,
    filterLinks,
    filterIframes,
    authorByline,
    tabCss,
    hrefHeader,
    bylineHeader,
    coverHeader,
    convertTables,
    rotateTables,
    tableResolution,
    shrinkGlyphs,
    fontName,
  } = options;
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
    css: epubCss(options),
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

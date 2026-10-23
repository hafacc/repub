import { alter, closeMatch, exactMatch, type MimeData } from "./alter";
import { baseTableCss, epubCss } from "./css";
import { epub, type ImageData, type ImageMime } from "./epub";
import type { EpubOptions } from "./options";
import { parse } from "./parse";
import { steps, within } from "./progress";

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

/** the parts of a render, weighted by how long each tends to take */
const stage = steps({ read: 2, alter: 5, images: 4, pack: 2 });

/** what a render can be told beyond the page itself */
export interface GenerateExtra {
  /** whether to cut the page down to its article first */
  summarize?: boolean;
  /** the title to use instead of the one read off the page */
  title?: string;
  /** the author to use instead of the one read off the page */
  author?: string;
  /** called as the render goes, with how much of it is done */
  onProgress?: (portion: number) => void;
}

export async function generate(
  mhtml: Uint8Array,
  brighten: Brighten,
  options: EpubOptions,
  {
    summarize = true,
    title: initTitle,
    author: initAuthor,
    onProgress = () => {},
  }: GenerateExtra = {},
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

  onProgress(stage.alter.from);
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

  // every image is its own slice of the images step, so a page full of them
  // reports as each one lands rather than all at once
  let done = 0;
  const count = seen.size;
  const ticked = <Value>(value: Value): Value => {
    done += 1;
    onProgress(within(stage.images, done / count).progress);
    return value;
  };

  onProgress(stage.images.from);
  const proms = [];
  for (const href of seen) {
    const { mime, data } = assetData.get(href)!;
    proms.push(
      brighten(data, mime).then(
        ([data, mime]) => ticked([href, data, mime] as const),
        (err: unknown) => {
          console.warn(`problem brightening ${href}:`, err);
          return ticked(null);
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

  onProgress(stage.pack.from);
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
  onProgress(1);
  return {
    epub: buffer,
    title: initTitle ?? title,
    initial: content,
    altered,
    brightened,
    assets: assetData,
  };
}

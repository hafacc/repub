import { pageCapture } from "./capture";
import type { EpubOptions } from "./options";
import { parse } from "./parse";
import { readMetadata } from "./render";

/** what someone can set on a conversion before it starts */
export interface Details {
  /** the title for the document, in place of the one on the page */
  title?: string;
  /** the author for the document, in place of the one on the page */
  author?: string;
  /** the tags to upload the document under, in place of the saved ones */
  tags?: string[];
}

/** a page as captured, with the title and author it names */
export interface Read {
  /** the captured page, to convert without capturing it again */
  mhtml: ArrayBuffer;
  /** the title the page names, empty when it names none */
  title: string;
  /** the author the page names, empty when it names none */
  author: string;
}

/**
 * capture a page and read the title and author off it
 *
 * The capture is handed back so that converting the page afterwards doesn't
 * have to read it a second time.
 */
export async function readPage(
  tabId: number,
  opts: EpubOptions,
): Promise<Read> {
  const mhtml = await pageCapture(tabId);
  const { href, title: subject, content } = await parse(new Uint8Array(mhtml));
  let title: string | undefined;
  let author: string | undefined;
  try {
    const found = await readMetadata(
      new TextEncoder().encode(content),
      href,
      opts,
    );
    title = found.title;
    author = found.author;
  } catch (ex) {
    // a page we can't read is still a page we can convert
    console.warn(ex);
  }
  return {
    mhtml,
    title: title ?? subject ?? "",
    author: author ?? "",
  };
}

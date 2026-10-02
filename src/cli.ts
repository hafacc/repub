import { argv } from "bun";
import { JSDOM } from "jsdom";
import yargs from "yargs";
import type { ImageMime } from "./epub";
import { generate } from "./lib";
import { defaultOptions } from "./options";

function brighten(
  buffer: Uint8Array,
  mime: string,
): Promise<readonly [Uint8Array, ImageMime]> {
  /* TODO ideally use sharp to load, resize, brighten but doing so with esbuild
   * likely requires a custom loader for the native code, and there doesn't
   * seem to be non-native webp-parsing. The alternative would be to write this
   * CLI in deno, but deno ts interop isn't great */
  if (
    mime === "image/png" ||
    mime === "image/jpeg" ||
    mime === "image/gif" ||
    mime === "image/svg+xml"
  ) {
    return Promise.resolve([buffer, mime] as const);
  } else {
    console.warn(`can't easily convert ${mime}, so using dummy image`);
    const buff = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    return Promise.resolve([buff, "image/png"] as const);
  }
}

// patch global with dom
const dom = new JSDOM();
global.DocumentType = dom.window.DocumentType;
global.DOMParser = dom.window.DOMParser;
global.Element = dom.window.Element;
global.HTMLAnchorElement = dom.window.HTMLAnchorElement;
global.HTMLIFrameElement = dom.window.HTMLIFrameElement;
global.HTMLImageElement = dom.window.HTMLImageElement;
global.HTMLMetaElement = dom.window.HTMLMetaElement;
global.HTMLPictureElement = dom.window.HTMLPictureElement;
global.HTMLTableElement = dom.window.HTMLTableElement;
global.SVGElement = dom.window.SVGElement;
global.Text = dom.window.Text;
global.XMLSerializer = dom.window.XMLSerializer;
// biome-ignore lint/complexity/useLiteralKeys: part of index expression
global.Image = dom.window["Image"] as typeof Image;

(async () => {
  const args = await yargs(argv.slice(2))
    .scriptName("repub")
    .usage(
      "$0 <mhtml>",
      "execute repub locally, with extra logging and alternate output",
    )
    .positional("mhtml", {
      describe: "the mhtml file to parse",
      type: "string",
    })
    .option("raw-output", {
      alias: "r",
      describe: "where to save the raw html of the initial page",
      type: "string",
    })
    .option("summarized-output", {
      alias: "s",
      describe: "where to save the summarized html",
      type: "string",
    })
    .option("epub-output", {
      alias: "o",
      describe: "where to save the final epub",
      type: "string",
    })
    .option("img-sim-thresh", {
      describe: "how similar image urls need to be to use them",
      type: "number",
      default: defaultOptions.imageHrefSimilarityThreshold,
    })
    .option("image-handling", {
      describe: "how to handle images",
      type: "string",
      default: defaultOptions.imageHandling,
      choices: ["strip", "filter", "keep"] as const,
    })
    .option("filter-links", {
      describe: "filter links from generated results",
      type: "boolean",
      default: defaultOptions.filterLinks,
    })
    .option("filter-iframes", {
      describe: "filter iframes from generated results",
      type: "boolean",
      default: defaultOptions.filterIframes,
    })
    .option("rm-css", {
      describe: "use remarkable css",
      type: "boolean",
      default: defaultOptions.rmCss,
    })
    .option("font-name", {
      describe: "the tablet font to render for, which decides what it can draw",
      choices: [
        "",
        "reMarkable Serif Small",
        "reMarkable Sans",
        "EB Garamond",
      ] as const,
      default: defaultOptions.fontName,
    })
    .option("shrink-glyphs", {
      describe: "shrink characters the tablet's font can't draw",
      choices: ["off", "dynamic", "robust"] as const,
      default: defaultOptions.shrinkGlyphs,
    })
    .option("fit-images", {
      describe: "keep images inside the page width",
      type: "boolean",
      default: defaultOptions.fitImages,
    })
    .option("code-css", {
      describe: "use code css",
      type: "boolean",
      default: defaultOptions.codeCss,
    })
    .option("tab-css", {
      describe: "use table css",
      type: "boolean",
      default: defaultOptions.tabCss,
    })
    .option("href-header", {
      describe: "add a header with the url",
      type: "boolean",
      default: defaultOptions.hrefHeader,
    })
    .option("byline-header", {
      describe: "add a header with the byline",
      type: "boolean",
      default: defaultOptions.bylineHeader,
    })
    .option("cover-header", {
      describe: "add a header with the cover image",
      type: "boolean",
      default: defaultOptions.coverHeader,
    })
    .option("author-byline", {
      describe:
        "display the byline as the article author rather than the stated byline",
      type: "boolean",
      default: defaultOptions.authorByline,
    })
    .option("verbose", {
      alias: "v",
      describe: "verbosity to log information",
      count: true,
    })
    .help()
    .alias("h", "help")
    .demandOption("mhtml")
    .strict().argv;

  const mhtml = await Bun.file(args.mhtml).bytes();

  const { initial, altered, assets, brightened, epub, title } = await generate(
    mhtml,
    brighten,
    {
      imageHrefSimilarityThreshold: args.imgSimThresh,
      imageHandling: args.imageHandling,
      filterLinks: args.filterLinks,
      filterIframes: args.filterIframes,
      rmCss: args.rmCss,
      fitImages: args.fitImages,
      shrinkGlyphs: args.shrinkGlyphs,
      fontName: args.fontName,
      codeCss: args.codeCss,
      tabCss: args.tabCss,
      hrefHeader: args.hrefHeader,
      bylineHeader: args.bylineHeader,
      coverHeader: args.coverHeader,
      authorByline: args.authorByline,
      // below are unused
      customCss: "",
      imageBrightness: 1,
      imageShrink: true,
      convertTables: false,
      rotateTables: false,
      tableResolution: 1,
    },
    true,
  );

  if (args.verbose > 0) {
    console.log();
    console.log("title");
    console.log("=====");
    console.log(title);
    console.log();
  }
  if (args.verbose > 2) {
    console.log("initial assets");
    console.log("--------------");
    for (const href of assets.keys()) {
      console.log(href);
    }
    console.log();
  }
  if (args.verbose > 1) {
    console.log("final images");
    console.log("------------");
    for (const href of brightened.keys()) {
      console.log(href);
    }
    console.log();
  }
  const proms = [];
  if (args.rawOutput) {
    const parser = new DOMParser();
    const serial = new XMLSerializer();
    proms.push(
      Bun.write(
        args.rawOutput,
        serial.serializeToString(parser.parseFromString(initial, "text/html")),
      ),
    );
  }
  if (args.summarizedOutput) {
    proms.push(Bun.write(args.summarizedOutput, altered));
  }
  if (args.epubOutput) {
    proms.push(Bun.write(args.epubOutput, epub));
  }
  await Promise.all(proms);
})().catch((ex: unknown) => {
  const message = ex instanceof Error ? ex.message : "unknown error";
  console.error(`problem with cli: ${message}`);
});

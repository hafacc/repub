import type { DeviceModel } from "rmapi-js";
import type { CssOptions } from "./css";

type Awaitable<T> = T | Promise<T>;

export interface Storage {
  set(vals: Readonly<Record<string, unknown>>): Awaitable<void>;
  get<K extends string>(
    keys: Readonly<Record<K, unknown>>,
  ): Awaitable<Record<K, unknown>>;
  remove(keys: string[]): Awaitable<void>;
}

const mockStorage: Storage = {
  set(vals: Readonly<Record<string, unknown>>): void {
    for (const [key, val] of Object.entries(vals)) {
      globalThis.localStorage.setItem(key, JSON.stringify(val));
    }
  },
  get<K extends string>(
    keys: Readonly<Record<K, unknown>>,
  ): Record<K, unknown> {
    return Object.fromEntries(
      Object.entries(keys).map(([key, def]) => {
        const val = globalThis.localStorage.getItem(key);
        return [key, val === null ? def : JSON.parse(val)];
      }),
    ) as Record<K, unknown>;
  },
  remove(keys: readonly string[]): void {
    for (const key of keys) {
      globalThis.localStorage.removeItem(key);
    }
  },
};

export type OutputStyle = "upload" | "download";
export type ImageHandling = "strip" | "filter" | "keep";
export type Orientation = "portrait" | "landscape";
export type Cover = "first" | "visited";

/** the tablet font, which both the epub and the upload need to know */
interface FontOption {
  fontName: string;
}

/** how we generate the epub */
export interface EpubOptions extends CssOptions {
  imageHandling: ImageHandling;
  imageBrightness: number;
  imageShrink: boolean;
  imageHrefSimilarityThreshold: number;
  hrefHeader: boolean;
  bylineHeader: boolean;
  coverHeader: boolean;
  filterLinks: boolean;
  filterIframes: boolean;
  authorByline: boolean;
  convertTables: boolean;
  rotateTables: boolean;
  tableResolution: number;
}

export interface UploadOptions extends FontOption {
  coverPageNumber: number;
  margins: number;
  textScale: number;
  lineHeight: number;
  tags: string;
  textAlignment: "left" | "justify";
  viewBackgroundFilter: "off" | "fullpage" | null;
  // the reMarkable we're sending to: the papers offered when printing, and the
  // screen trimming fits pdfs to
  device: DeviceModel;
  // zoom pdfs past their white margins
  trimPdf: boolean;
  authHost: string;
  rawHost: string;
  tokenUrl: string;
}

export interface Options extends EpubOptions, UploadOptions {
  deviceToken: string;
  outputStyle: OutputStyle;
  // how we download the epub
  downloadAsk: boolean;
  // did we notify about remarkable breaking
  didNotify: boolean;
  // if to prompt for title
  promptTitle: boolean;
}

export const defaultOptions: Options = {
  deviceToken: "",
  outputStyle: "upload",
  // how we download the epub
  downloadAsk: false,
  // did we notify about remarkable breaking in 2024
  didNotify: false,
  // ---- //
  // Epub //
  // ---- //
  imageHandling: "filter",
  imageHrefSimilarityThreshold: 0.2,
  imageBrightness: 1,
  imageShrink: true,
  hrefHeader: false,
  bylineHeader: true,
  coverHeader: true,
  rmCss: true,
  fitImages: false,
  codeCss: true,
  tabCss: true,
  customCss: "",
  filterLinks: true,
  filterIframes: true,
  authorByline: true,
  convertTables: false,
  rotateTables: false,
  tableResolution: 1,
  shrinkGlyphs: "off",
  // ------ //
  // Upload //
  // ------ //
  coverPageNumber: -1,
  fontName: "reMarkable Serif Small",
  margins: 125,
  textScale: 1,
  lineHeight: 100,
  tags: "",
  textAlignment: "justify",
  viewBackgroundFilter: null,
  device: "RM110",
  trimPdf: false,
  promptTitle: false,
  // -------- //
  // API URLs //
  // -------- //
  authHost: "https://webapp-prod.cloud.remarkable.engineering",
  rawHost: "https://eu.tectonic.remarkable.com",
  tokenUrl: "https://my.remarkable.com/device/browser/connect",
};

// replaced by `device` and `trimPdf`, but still read so an existing choice
// carries over
const retired = { pdfTrimDevice: null as DeviceModel | null };

export async function getOptions({
  storage = globalThis.chrome?.storage?.local ?? mockStorage,
}: {
  storage?: Storage;
} = {}): Promise<Options> {
  const [loaded, old] = await Promise.all([
    storage.get(defaultOptions),
    storage.get(retired),
  ]);
  const opts = loaded as Options;
  const { pdfTrimDevice } = old as typeof retired;
  if (pdfTrimDevice) {
    opts.device = pdfTrimDevice;
    opts.trimPdf = true;
    await Promise.all([
      storage.set({ device: opts.device, trimPdf: opts.trimPdf }),
      storage.remove(["pdfTrimDevice"]),
    ]);
  }
  return opts;
}

export type SetOptions = (options: Partial<Options>) => void;

export async function setOptions(
  opts: Partial<Options>,
  {
    storage = globalThis.chrome?.storage?.local ?? mockStorage,
  }: { storage?: Storage } = {},
): Promise<void> {
  await storage.set(opts);
}

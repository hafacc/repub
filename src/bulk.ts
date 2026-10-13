import { fromByteArray } from "base64-js";
import { pageCapture } from "./capture";
import { showFailed, showProgress } from "./icon";
import type { EpubOptions, Options, UploadOptions } from "./options";
import { render } from "./render";
import { uploadEpub } from "./upload";
import { errString, Semaphore, safeFilename, timeout } from "./utils";

// a page chrome has unloaded, or one still loading, has to finish before it can
// be captured, and a page that never does shouldn't hold up the rest
const WAKE_TIMEOUT = 30_000;

const room = new Semaphore(4);

/** an open tab offered for export */
export interface PageTab {
  tabId: number;
  title: string;
  url: string;
  // the page's own icon, which chrome only hands over with the tabs permission
  favIconUrl?: string;
  // whether the page is one pageCapture can read
  convertible: boolean;
}

/** how far along a page is, or what became of it */
export type PageState =
  | { kind: "running"; progress: number }
  | { kind: "finished" }
  | { kind: "failed"; error: string };

/** the browser work an export does, so tests can stand in for it */
interface ExportEnv {
  wake: (tabId: number) => Promise<void>;
  capture: (tabId: number) => Promise<ArrayBuffer>;
  convert: (
    mhtml: ArrayBuffer,
    opts: EpubOptions,
  ) => Promise<{ epub: Uint8Array; title?: string }>;
  send: (
    epub: Uint8Array,
    title: string,
    deviceToken: string,
    opts: UploadOptions,
  ) => Promise<void>;
  save: (epub: Uint8Array, filename: string, saveAs: boolean) => Promise<void>;
  mark: (tabId: number, state: PageState) => Promise<void>;
}

/** put a page's state on its own toolbar icon, the way a single page does */
async function markTab(tabId: number, state: PageState): Promise<void> {
  if (state.kind === "failed") {
    await showFailed(tabId);
  } else if (state.kind === "finished") {
    await showProgress(tabId, 1);
  } else {
    await showProgress(tabId, state.progress);
  }
}

/** what stops an export before it starts, when anything does */
export function blocker(opts: Options): string | undefined {
  if (opts.outputStyle === "upload" && !opts.deviceToken) {
    return "must be authenticated to upload documents to reMarkable";
  } else {
    return undefined;
  }
}

/** whether pageCapture can read this url */
export function convertible(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * the open tabs to offer, dropping this extension's own pages
 *
 * `own` is the extension's url prefix; its own pages can never be converted,
 * and the options page itself is always one of them.
 */
export function listable(
  tabs: readonly chrome.tabs.Tab[],
  own: string,
): PageTab[] {
  const pages: PageTab[] = [];
  for (const { id, url, title, favIconUrl } of tabs) {
    if (id === undefined || !url || url.startsWith(own)) continue;
    pages.push({
      tabId: id,
      title: title ?? url,
      url,
      favIconUrl,
      convertible: convertible(url),
    });
  }
  return pages;
}

/** wait for a tab to be loaded, reloading one chrome has unloaded */
async function wakeTab(tabId: number): Promise<void> {
  let stop = (): void => {};
  const loaded = new Promise<void>((resolve) => {
    const onUpdated = (
      updated: number,
      { status }: chrome.tabs.OnUpdatedInfo,
    ): void => {
      if (updated === tabId && status === "complete") {
        resolve();
      }
    };
    stop = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  try {
    // listening before asking, so a tab that loads while we ask still counts
    const { discarded, status } = await chrome.tabs.get(tabId);
    if (discarded) {
      await chrome.tabs.reload(tabId);
    } else if (status === "complete") {
      return;
    }
    await timeout(loaded, WAKE_TIMEOUT, "page took too long to load");
  } finally {
    stop();
  }
}

async function downloadEpub(
  epub: Uint8Array,
  filename: string,
  saveAs: boolean,
): Promise<void> {
  const base64 = fromByteArray(epub);
  await chrome.downloads.download({
    filename,
    url: `data:application/epub+zip;base64,${base64}`,
    saveAs,
  });
}

/**
 * convert one open tab and either upload or download it
 *
 * `name` is the filename the user typed, which stands in for the page's own
 * title when they gave one; the epub itself keeps the title read off the page.
 */
export async function exportPage(
  page: PageTab,
  name: string | undefined,
  opts: Options,
  report: (state: PageState) => void,
  env: Partial<ExportEnv> = {},
): Promise<void> {
  const {
    wake = wakeTab,
    capture = pageCapture,
    convert = render,
    send = uploadEpub,
    save = downloadEpub,
  } = env;
  const { deviceToken, outputStyle, downloadAsk, ...rest } = opts;
  const stop = blocker(opts);
  if (stop) {
    throw new Error(stop);
  }
  // an emptied field is no name at all
  const given = name?.trim() || undefined;

  await using _permit = await room.lock();
  report({ kind: "running", progress: 0.1 });
  await wake(page.tabId);
  report({ kind: "running", progress: 0.25 });
  const mhtml = await capture(page.tabId);
  report({ kind: "running", progress: 0.5 });
  const { epub, title = given ?? "missing title" } = await convert(mhtml, rest);
  report({ kind: "running", progress: 0.75 });

  if (outputStyle === "download") {
    await save(
      epub,
      `${safeFilename(given ?? title)}.epub`,
      downloadAsk && given === undefined,
    );
  } else {
    await send(epub, title, deviceToken, rest);
  }
  report({ kind: "finished" });
}

/** export every page, reporting each one as it goes */
export async function exportPages(
  pages: readonly PageTab[],
  names: ReadonlyMap<number, string>,
  opts: Options,
  report: (tabId: number, state: PageState) => void,
  env: Partial<ExportEnv> = {},
): Promise<void> {
  const { mark = markTab } = env;
  await Promise.all(
    pages.map(async (page) => {
      const show = (state: PageState): void => {
        report(page.tabId, state);
        mark(page.tabId, state).catch((ex: unknown) => {
          console.warn(ex);
        });
      };
      try {
        await exportPage(page, names.get(page.tabId), opts, show, env);
      } catch (ex) {
        show({ kind: "failed", error: errString(ex) });
      }
    }),
  );
}

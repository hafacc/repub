import { fromByteArray } from "base64-js";
import { pageCapture } from "./capture";
import { type Details, type Read, readPage } from "./details";
import type { DetailsResponse, PopupRequest } from "./messages";
import { getOptions, type Options } from "./options";
import { registerPrinter } from "./printer";
import { steps, within } from "./progress";
import { render } from "./render";
import { getTab } from "./status";
import { knownTags } from "./tags";
import { uploadEpub } from "./upload";
import { errString, safeFilename, sleep, TimedOut } from "./utils";

/** the parts of a conversion, weighted by how long each tends to take */
const stage = steps({ capture: 2, render: 6, send: 2 });

/** the item this extension adds to the one the icon has of its own */
const MENU_ID = "details";

// a page read for a popup that is open, so that converting it afterwards
// doesn't read it all over again
const prepared = new Map<number, Promise<Read>>();
// the tabs whose icon is showing the popup instead of converting
const popped = new Set<number>();

function prepare(tabId: number, opts: Options): Promise<Read> {
  const reading = readPage(tabId, opts);
  prepared.set(tabId, reading);
  reading.catch(() => {
    if (prepared.get(tabId) === reading) {
      prepared.delete(tabId);
    }
  });
  return reading;
}

/** hand the icon back to a click, now that the popup has gone */
function release(tabId: number): void {
  if (popped.delete(tabId)) {
    chrome.action.setPopup({ tabId, popup: "" }).catch(() => {
      // a tab that has gone has nothing left to set
    });
  }
}

/** forget a page we read, since what we read of it no longer holds */
function forget(tabId: number): void {
  prepared.delete(tabId);
  release(tabId);
}

/**
 * create and upload epub
 */
async function rePub(tabId: number, details: Details = {}): Promise<void> {
  // get active state for clearing the icon with navigation
  // taken before anything is awaited, so that a popup closing a moment later
  // can't take the page we read for it away again
  const reading = prepared.get(tabId);
  prepared.delete(tabId);
  const tab = getTab(tabId);
  try {
    tab.init();

    const { deviceToken, outputStyle, downloadAsk, ...opts } =
      await getOptions();

    tab.progress(within(stage.capture, 0));

    let read: Read | undefined;
    if (reading) {
      try {
        read = await reading;
      } catch (ex) {
        // a page we failed to read beforehand is read again here
        console.warn(ex);
      }
    }
    const mhtml = read?.mhtml ?? (await pageCapture(tabId));
    tab.progress(within(stage.render, 0));

    const { epub, title = "missing title" } = await render(mhtml, opts, {
      title: details.title,
      author: details.author,
      onProgress: (portion) => {
        tab.progress(within(stage.render, portion));
      },
    });
    tab.progress(within(stage.send, 0));

    // upload
    if (outputStyle === "download") {
      const base64 = fromByteArray(new Uint8Array(epub));
      await chrome.downloads.download({
        filename: `${safeFilename(title)}.epub`,
        url: `data:application/epub+zip;base64,${base64}`,
        saveAs: downloadAsk,
      });
    } else if (deviceToken) {
      await uploadEpub(
        epub,
        title,
        deviceToken,
        opts,
        details.tags ? { tags: [...details.tags] } : {},
      );
    } else {
      chrome.runtime.openOptionsPage().catch((ex: unknown) => {
        const message = ex instanceof Error ? ex.message : "unknown error";
        console.error(`couldn't open option page: ${message}`);
      });
      throw new Error(
        "must be authenticated to upload documents to reMarkable",
      );
    }

    tab.complete();
  } catch (ex) {
    const msg = ex instanceof Error ? ex.toString() : "unknown error";
    await Promise.all([
      chrome.notifications.create({
        type: "basic",
        iconUrl: "images/repub_128.png",
        title: "Conversion to epub failed",
        message: msg,
      }),
      tab.error(),
    ]);
    throw ex;
  } finally {
    await tab.done();
    // NOTE leave progress around to see
    await sleep(500);
    await tab.drop();
  }
}

/** what the icon's own menu calls this extension's item */
function menuTitle(upload: boolean): string {
  return upload ? "Set title, author and tags…" : "Set title and author…";
}

/** put this extension's item in the menu the icon has of its own */
async function showMenu(): Promise<void> {
  const { outputStyle } = await getOptions();
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: menuTitle(outputStyle === "upload"),
    contexts: ["action"],
  });
}

/** open the popup over `tabId`, reading the page while it's up */
async function askDetails(tabId: number, windowId: number): Promise<void> {
  const opts = await getOptions();
  prepare(tabId, opts);
  await chrome.action.setPopup({ tabId, popup: "popup.html" });
  popped.add(tabId);
  try {
    await chrome.action.openPopup({ windowId });
  } catch (ex) {
    // a popup chrome won't open anchored to the icon still opens beside it
    console.warn(ex);
    release(tabId);
    await chrome.windows.create({
      url: `popup.html?tab=${tabId.toFixed()}`,
      type: "popup",
      width: 380,
      height: 420,
    });
  }
}

/** what the popup shows in its fields */
async function pageDetails(tabId: number): Promise<DetailsResponse> {
  // the popup is up and has what it needs, so the icon goes back to being a
  // button that converts; a click landing now closes the popup either way
  release(tabId);
  const options = await getOptions();
  const upload = options.outputStyle === "upload";
  const reading = prepared.get(tabId) ?? prepare(tabId, options);
  const listing = upload
    ? knownTags(options.deviceToken, options)
    : Promise.resolve([]);

  let title = "";
  let author = "";
  let error: string | undefined;
  try {
    ({ title, author } = await reading);
  } catch (ex) {
    error =
      ex instanceof TimedOut
        ? "the page never finished loading"
        : errString(ex);
  }
  return { title, author, known: await listing, error };
}

chrome.runtime.onInstalled.addListener(() => {
  showMenu().catch((ex: unknown) => {
    console.error("couldn't add to the icon's menu", ex);
  });
});

chrome.runtime.onStartup.addListener(() => {
  showMenu().catch((ex: unknown) => {
    console.error("couldn't add to the icon's menu", ex);
  });
});

// the item says what it sets, so it changes with the output it would set it on
chrome.storage.onChanged.addListener((changes) => {
  const { outputStyle: change } = changes;
  if (change) {
    chrome.contextMenus
      .update(MENU_ID, { title: menuTitle(change.newValue === "upload") })
      .catch(() => {
        // an item that isn't there yet gets its title when it's created
      });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    askDetails(tab.id, tab.windowId).catch((ex: unknown) => {
      console.error(ex);
    });
  }
});

// watch for clicks
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    rePub(tab.id).catch((ex: unknown) => {
      console.error(ex);
    });
  }
});

// the popup holds a port open, so closing it hands the icon back to a click
chrome.runtime.onConnect.addListener((port) => {
  const [kind, id] = port.name.split(":");
  const tabId = Number(id);
  if (kind === "popup" && Number.isInteger(tabId)) {
    port.onDisconnect.addListener(() => {
      release(tabId);
    });
  }
});

// a page that has navigated is no longer the page we read
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId === 0) {
    forget(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  prepared.delete(tabId);
});

// watch for messages from popup
chrome.runtime.onMessage.addListener(
  (message: PopupRequest, _, respond: (response?: unknown) => void) => {
    if (message.type === "details") {
      pageDetails(message.tabId).then(respond, (ex: unknown) => {
        console.error(ex);
        respond(undefined);
      });
      return true;
    } else {
      respond(undefined);
      rePub(message.tabId, message).catch((ex: unknown) => {
        console.error(ex);
      });
      return false;
    }
  },
);

registerPrinter();

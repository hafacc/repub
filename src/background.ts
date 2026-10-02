import { fromByteArray } from "base64-js";
import { pageCapture } from "./capture";
import type { TitleRequest } from "./messages";
import { getOptions } from "./options";
import { registerPrinter } from "./printer";
import { render } from "./render";
import { getTab } from "./status";
import { uploadEpub } from "./upload";
import { safeFilename, sleep } from "./utils";

/**
 * create and upload epub
 */
async function rePub(
  tabId: number,
  action: boolean,
  initTitle?: string,
  initAuthor?: string,
) {
  // get active state for clearing badge with navigation
  const tab = getTab(tabId);
  try {
    await tab.init();

    const { deviceToken, outputStyle, downloadAsk, promptTitle, ...opts } =
      await getOptions();

    if (action && promptTitle) {
      await Promise.all([
        chrome.action.setBadgeText({
          tabId,
          text: "",
        }),
        chrome.action.setPopup({ popup: "popup.html" }),
      ]);
      await chrome.action.openPopup();
      return;
    }

    await tab.progress(25);

    const mhtml = await pageCapture(tabId);
    await tab.progress(50);

    const { epub, title = "missing title" } = await render(
      mhtml,
      opts,
      initTitle,
      initAuthor,
    );
    await tab.progress(75);

    // upload
    if (outputStyle === "download") {
      const base64 = fromByteArray(new Uint8Array(epub));
      await chrome.downloads.download({
        filename: `${safeFilename(title)}.epub`,
        url: `data:application/epub+zip;base64,${base64}`,
        saveAs: downloadAsk,
      });
    } else if (deviceToken) {
      await uploadEpub(epub, title, deviceToken, opts);
    } else {
      chrome.runtime.openOptionsPage().catch((ex: unknown) => {
        const message = ex instanceof Error ? ex.message : "unknown error";
        console.error(`couldn't open option page: ${message}`);
      });
      throw new Error(
        "must be authenticated to upload documents to reMarkable",
      );
    }

    await tab.complete(outputStyle === "download" ? "done" : "sent");
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

// watch for clicks
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    rePub(tab.id, true).catch((ex: unknown) => {
      console.error(ex);
    });
  }
});

// watch for messages from popup
chrome.runtime.onMessage.addListener(
  ({ tabId, title, author }: TitleRequest, _, response) => {
    response(undefined);
    rePub(tabId, false, title, author).catch((ex: unknown) => {
      console.error(ex);
    });
  },
);

registerPrinter();

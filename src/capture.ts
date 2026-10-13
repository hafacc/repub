import { sleep } from "./utils";

/**
 * capture the current page
 *
 * A capture that fails is tried again up to `retries` times, waiting a time
 * drawn evenly between nothing and a bound that starts at `wait` milliseconds
 * and doubles with every attempt.
 */
export async function pageCapture(
  tabId: number,
  { retries = 3, wait = 1000 }: { retries?: number; wait?: number } = {},
): Promise<ArrayBuffer> {
  for (let attempt = 0; attempt < retries; ++attempt) {
    try {
      // NOTE this occasionally returns null, or throws an error for not being
      // available, both of these are transient, so we just retry
      const blob = await chrome.pageCapture.saveAsMHTML({ tabId });
      if (blob) {
        return await blob.arrayBuffer();
      } else {
        console.warn(chrome.runtime.lastError);
      }
    } catch (ex) {
      console.warn(ex);
    }
    if (attempt + 1 < retries) {
      await sleep(Math.random() * wait * 2 ** attempt);
    }
  }
  throw new Error("couldn't fetch page");
}

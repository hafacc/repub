import { fromByteArray, toByteArray } from "base64-js";
import type { DeviceModel, PutOptions } from "rmapi-js";
import type {
  InitMessage,
  Message,
  PartMessage,
  Response,
  TrimMessage,
} from "./messages";
import type { EpubOptions } from "./options";

const MAX_CHUNK_SIZE = 50_000_000;
let ensuring: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  // share one in-flight check so concurrent renders don't both create; the
  // hasDocument guard also covers a document that outlived the service worker
  ensuring ??= (async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: "/offscreen.html",
        reasons: [
          chrome.offscreen.Reason.DOM_PARSER,
          // pdf.js renders pages in a worker, which a service worker can't start
          chrome.offscreen.Reason.WORKERS,
        ],
        justification: "Parse DOM and rasterize pdf pages",
      });
    }
  })().finally(() => {
    ensuring = null;
  });
  await ensuring;
}

/**
 * send a payload to the offscreen document and collect its reply
 *
 * The payload is base64'd and chunked because a single message can't carry an
 * arbitrarily large buffer. `receive` resolves once it has everything it needs.
 */
async function exchange<T>(
  init: (numParts: number) => Message,
  payload: Uint8Array,
  receive: (message: Response, resolve: (value: T) => void) => void,
): Promise<T> {
  await ensureOffscreen();

  const encoded = fromByteArray(payload);
  const chunks: string[] = [];
  for (let start = 0; start < encoded.length; start += MAX_CHUNK_SIZE) {
    chunks.push(encoded.slice(start, start + MAX_CHUNK_SIZE));
  }

  return await new Promise<T>((resolve, reject) => {
    const port = chrome.runtime.connect();
    port.onDisconnect.addListener(() => {
      reject(Error("port disconnected early"));
    });
    port.onMessage.addListener((message: Response) => {
      if (message.type === "error") {
        reject(Error(message.err));
      } else {
        receive(message, resolve);
      }
    });

    port.postMessage(init(chunks.length));
    for (const [index, part] of chunks.entries()) {
      const partMessage: PartMessage = { type: "part", index, part };
      port.postMessage(partMessage);
    }
  });
}

export async function render(
  mhtml: ArrayBuffer,
  opts: EpubOptions,
  title?: string,
  author?: string,
  summarize: boolean = true,
): Promise<{ epub: Uint8Array; title?: string }> {
  const parts: string[] = [];
  let receivedParts = 0;
  let expectedParts: number | undefined;
  let parsedTitle: string | undefined;

  const collected = await exchange<string[]>(
    (numParts): InitMessage => ({
      type: "info",
      numParts,
      options: opts,
      title,
      author,
      summarize,
    }),
    new Uint8Array(mhtml),
    (message, resolve) => {
      if (message.type === "part") {
        parts[message.index] = message.part;
        receivedParts++;
      } else if (message.type === "info") {
        expectedParts = message.numParts;
        parsedTitle = message.title;
      }
      if (expectedParts === receivedParts) {
        resolve(parts);
      }
    },
  );
  return { epub: toByteArray(collected.join("")), title: parsedTitle };
}

/** measure a pdf's margins for `device`, returning the zoom that hides them */
export async function measureMargins(
  pdf: Uint8Array,
  device: DeviceModel,
): Promise<Partial<PutOptions>> {
  return await exchange<Partial<PutOptions>>(
    (numParts): TrimMessage => ({ type: "trim", numParts, device }),
    pdf,
    (message, resolve) => {
      if (message.type === "trim") {
        resolve(message.zoom);
      }
    },
  );
}

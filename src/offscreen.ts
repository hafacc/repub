import { fromByteArray, toByteArray } from "base64-js";
import { brighten } from "./image";
import { generate } from "./lib";
import type { InitMessage, Message, Response, TrimMessage } from "./messages";
import { analyzePdfMargins } from "./pdf-trim";
import { errString } from "./utils";

const MAX_CHUNK_SIZE = 50_000_000;

async function makeEpub(
  port: chrome.runtime.Port,
  payload: Uint8Array,
  { options, title, author, summarize }: InitMessage,
): Promise<void> {
  const bright = (buffer: Uint8Array, mime: string) =>
    brighten(buffer, mime, options.imageBrightness, false, options.imageShrink);
  const { epub, title: parsedTitle } = await generate(
    payload,
    bright,
    options,
    summarize,
    title,
    author,
  );
  const encoded = fromByteArray(epub);

  // chunk response to fit in message size
  const chunks: string[] = [];
  for (let start = 0; start < encoded.length; start += MAX_CHUNK_SIZE) {
    chunks.push(encoded.slice(start, start + MAX_CHUNK_SIZE));
  }

  // send info
  const info: Response = {
    type: "info",
    numParts: chunks.length,
    title: parsedTitle,
  };
  port.postMessage(info);

  // send parts
  for (const [index, part] of chunks.entries()) {
    const msg: Response = { type: "part", index, part };
    port.postMessage(msg);
  }
}

async function measurePdf(
  port: chrome.runtime.Port,
  payload: Uint8Array,
  { device }: TrimMessage,
): Promise<void> {
  const zoom = await analyzePdfMargins(payload, device);
  const resp: Response = { type: "trim", zoom };
  port.postMessage(resp);
}

chrome.runtime.onConnect.addListener((port) => {
  const parts: string[] = [];
  let receivedParts = 0;
  let request: InitMessage | TrimMessage | undefined;

  port.onMessage.addListener((message: Message) => {
    if (message.type === "part") {
      parts[message.index] = message.part;
      receivedParts++;
    } else {
      request = message;
    }
    if (request !== undefined && request.numParts === receivedParts) {
      const init = request;
      const payload = toByteArray(parts.join(""));
      (async () => {
        if (init.type === "trim") {
          await measurePdf(port, payload, init);
        } else {
          await makeEpub(port, payload, init);
        }
      })()
        .catch((ex: unknown) => {
          const resp: Response = {
            type: "error",
            err: errString(ex),
          };
          port.postMessage(resp);
        })
        .finally(() => {
          port.disconnect();
        });
    }
  });
});

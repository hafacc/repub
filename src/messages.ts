import type { DeviceModel, PutOptions } from "rmapi-js";
import type { EpubOptions } from "./options";

// NOTE in order to pass messages we need to convert ArrayBuffers to strings.
// The most straightforward way is to encode the arrays as 16 bit elements, and
// then convert those to char codes. However, this requires that the arrays
// have an even length (which they aren't guaranteed to). handling this case is
// a little more difficult, but probably more efficient than base64 encoding as
// we do now:
// https://developer.chrome.com/blog/how-to-convert-arraybuffer-to-and-from-string/

export interface InitMessage {
  type: "info";
  numParts: number;
  options: EpubOptions;
  title?: string;
  author?: string;
  summarize: boolean;
}

/** analyze a pdf's margins for the given device */
export interface TrimMessage {
  type: "trim";
  numParts: number;
  device: DeviceModel;
}

export interface InitResponse {
  type: "info";
  numParts: number;
  title?: string;
}

export interface PartMessage {
  type: "part";
  index: number;
  part: string;
}

export interface TrimResponse {
  type: "trim";
  zoom: Partial<PutOptions>;
}

export interface ErrorMessage {
  type: "error";
  err: string;
}

export type Message = InitMessage | TrimMessage | PartMessage;

export type Response = InitResponse | TrimResponse | PartMessage | ErrorMessage;

export interface TitleRequest {
  tabId: number;
  title?: string;
  author?: string;
}

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

/**
 * read a page's title and author without rendering it
 *
 * The payload is the page's html alone, without its images, since nothing
 * outside the markup names an author.
 */
export interface MetaMessage {
  type: "meta";
  numParts: number;
  url: string;
  authorByline: boolean;
  domainByline: boolean;
  filterLinks: boolean;
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

/** the title and author read off a page */
export interface MetaResponse {
  type: "meta";
  title?: string;
  author?: string;
}

export interface TrimResponse {
  type: "trim";
  zoom: Partial<PutOptions>;
}

/** how much of the epub is done, as a portion of the whole render */
export interface ProgressResponse {
  type: "progress";
  portion: number;
}

export interface ErrorMessage {
  type: "error";
  err: string;
}

export type Message = InitMessage | TrimMessage | MetaMessage | PartMessage;

export type Response =
  | InitResponse
  | TrimResponse
  | MetaResponse
  | ProgressResponse
  | PartMessage
  | ErrorMessage;

/** the popup asking what to put in its fields */
export interface DetailsRequest {
  type: "details";
  tabId: number;
}

/** what the popup puts in its fields */
export interface DetailsResponse {
  title: string;
  author: string;
  /** the tags already in use on the tablet, for the tag field to offer */
  known: string[];
  /**
   * what went wrong reading the page, when something did
   *
   * A page we couldn't read is a page we couldn't convert either, so this
   * stops the conversion rather than only warning about it.
   */
  error?: string;
}

/** the popup asking for the conversion to go ahead */
export interface ConvertRequest {
  type: "convert";
  tabId: number;
  title?: string;
  author?: string;
  tags?: string[];
}

export type PopupRequest = DetailsRequest | ConvertRequest;

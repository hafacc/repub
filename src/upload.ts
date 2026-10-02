import { type PutOptions, type RemarkableApi, remarkable } from "rmapi-js";
import type { UploadOptions } from "./options";

const CACHE_KEY = "rmCache";
let cachedKey = "";
let cachedApi: Promise<RemarkableApi> | undefined;

function getApi(
  deviceToken: string,
  maxCacheSize: number,
  authHost: string,
  uploadHost: string,
  rawHost: string,
): Promise<RemarkableApi> {
  const key = `${deviceToken}|${authHost}|${uploadHost}|${rawHost}`;
  if (cachedApi === undefined || cachedKey !== key) {
    // caching the promise, not the api, keeps concurrent uploads on a single
    // instance, whose mutex then serializes their root updates
    const pending = (async () => {
      const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
      return await remarkable(deviceToken, {
        maxCacheSize,
        cache: cache as string,
        authHost,
        uploadHost,
        rawHost,
      });
    })();
    pending.catch(() => {
      // a failed auth shouldn't poison every later upload
      if (cachedApi === pending) {
        cachedApi = undefined;
      }
    });
    cachedKey = key;
    cachedApi = pending;
  }
  return cachedApi;
}

async function upload(
  payload: Uint8Array,
  title: string,
  deviceToken: string,
  {
    tags,
    viewBackgroundFilter,
    authHost,
    uploadHost,
    rawHost,
    tokenUrl: _,
    device: __,
    trimPdf: ___,
    ...rest
  }: UploadOptions,
  put: (
    api: RemarkableApi,
    name: string,
    buffer: Uint8Array,
    opts: PutOptions,
  ) => Promise<unknown>,
  extra: Partial<PutOptions> = {},
): Promise<void> {
  const tagList = [
    ...Iterator.from(tags.split(","))
      .map((tag) => tag.trim())
      .filter((tag) => !!tag.length),
  ];
  const opts = {
    ...rest,
    ...extra,
    tags: tagList,
    viewBackgroundFilter: viewBackgroundFilter ?? undefined,
    title,
  };
  const api = await getApi(
    deviceToken,
    1_000_000,
    authHost,
    uploadHost,
    rawHost,
  );
  await put(api, title, payload, opts);
  await chrome.storage.local.set({ [CACHE_KEY]: api.dumpCache() });
}

export function uploadEpub(
  epub: Uint8Array,
  title: string,
  deviceToken: string,
  options: UploadOptions,
): Promise<void> {
  return upload(epub, title, deviceToken, options, (api, name, buffer, opts) =>
    api.putEpub(name, buffer, opts),
  );
}

export function uploadPdf(
  pdf: Uint8Array,
  title: string,
  deviceToken: string,
  options: UploadOptions,
  extra: Partial<PutOptions> = {},
): Promise<void> {
  return upload(
    pdf,
    title,
    deviceToken,
    options,
    (api, name, buffer, opts) => api.putPdf(name, buffer, opts),
    extra,
  );
}

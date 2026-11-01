import { type PutOptions, type RemarkableApi, remarkable } from "rmapi-js";
import type { UploadOptions } from "./options";
import { parseTags } from "./utils";

const CACHE_KEY = "rmCache";
let cachedKey = "";
let cachedApi: Promise<RemarkableApi> | undefined;

function getApi(
  deviceToken: string,
  maxCacheSize: number,
  authHost: string,
  rawHost: string,
): Promise<RemarkableApi> {
  const key = `${deviceToken}|${authHost}|${rawHost}`;
  if (cachedApi === undefined || cachedKey !== key) {
    // caching the promise, not the api, keeps concurrent uploads on a single
    // instance, whose mutex then serializes their root updates
    const pending = (async () => {
      const { [CACHE_KEY]: cache } = await chrome.storage.local.get(CACHE_KEY);
      return await remarkable(deviceToken, {
        maxCacheSize,
        cache: cache as string,
        authHost,
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
  const opts = {
    ...rest,
    ...extra,
    // tags given for this one document stand in for the saved ones
    tags: extra.tags ?? parseTags(tags),
    viewBackgroundFilter: viewBackgroundFilter ?? undefined,
    title,
  };
  const api = await getApi(deviceToken, 1_000_000, authHost, rawHost);
  await put(api, title, payload, opts);
  await chrome.storage.local.set({ [CACHE_KEY]: api.dumpCache() });
}

export function uploadEpub(
  epub: Uint8Array,
  title: string,
  deviceToken: string,
  options: UploadOptions,
  extra: Partial<PutOptions> = {},
): Promise<void> {
  return upload(
    epub,
    title,
    deviceToken,
    options,
    (api, name, buffer, opts) => api.putEpub(name, buffer, opts),
    extra,
  );
}

/** every tag already in use on the tablet */
export async function listTags(
  deviceToken: string,
  { authHost, rawHost }: Pick<UploadOptions, "authHost" | "rawHost">,
): Promise<string[]> {
  const api = await getApi(deviceToken, 1_000_000, authHost, rawHost);
  const names = new Set<string>();
  for (const { tags } of await api.listItems()) {
    for (const tag of tags ?? []) {
      const name = (typeof tag === "string" ? tag : tag.name).trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
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

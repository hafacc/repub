import type { UploadOptions } from "./options";
import { listTags } from "./upload";

const CACHE_KEY = "rmTags";
// how old the remembered list can get before it's worth asking again
const STALE = 60 * 60 * 1000;

/** what the tablet's tags were, and when we last asked */
interface Cached {
  tags: string[];
  at: number;
}

let refreshing: Promise<string[]> | null = null;

function refresh(
  deviceToken: string,
  opts: Pick<UploadOptions, "authHost" | "rawHost">,
): Promise<string[]> {
  refreshing ??= listTags(deviceToken, opts)
    .then(async (tags) => {
      const cached: Cached = { tags, at: Date.now() };
      await chrome.storage.local.set({ [CACHE_KEY]: cached });
      return tags;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * the tags already in use on the tablet, for a tag field to offer
 *
 * A list we've asked for before comes back at once, and a fresh one is fetched
 * for next time, since a field that waits on the network is worse than one
 * offering a tag that has since been renamed.
 */
export async function knownTags(
  deviceToken: string,
  opts: Pick<UploadOptions, "authHost" | "rawHost">,
): Promise<string[]> {
  if (!deviceToken) {
    return [];
  }
  const { [CACHE_KEY]: stored } = await chrome.storage.local.get(CACHE_KEY);
  const cached = stored as Cached | undefined;
  if (cached) {
    if (Date.now() - cached.at > STALE) {
      refresh(deviceToken, opts).catch((ex: unknown) => {
        console.warn("couldn't list the tablet's tags", ex);
      });
    }
    return cached.tags;
  } else {
    try {
      return await refresh(deviceToken, opts);
    } catch (ex) {
      console.warn("couldn't list the tablet's tags", ex);
      return [];
    }
  }
}

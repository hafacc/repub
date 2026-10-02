import { expect, test } from "bun:test";
import {
  defaultOptions,
  getOptions,
  type Storage,
  setOptions,
} from "./options";

class MapStorage implements Storage {
  #backing = new Map<string, string>();

  set(vals: Readonly<Record<string, unknown>>): void {
    for (const [k, v] of Object.entries(vals)) {
      this.#backing.set(k, JSON.stringify(v));
    }
  }

  get<K extends string>(
    keys: Readonly<Record<K, unknown>>,
  ): Record<K, unknown> {
    return Object.fromEntries(
      Object.entries(keys).map(([key, def]) => {
        const val = this.#backing.get(key);
        return [key, val ? JSON.parse(val) : def];
      }),
    ) as Record<K, unknown>;
  }

  remove(keys: string[]): void {
    for (const key of keys) {
      this.#backing.delete(key);
    }
  }
}

test("basic", async () => {
  const storage = new MapStorage();

  // default works
  const opts = await getOptions({ storage });
  expect(opts).toEqual({ ...defaultOptions, outputStyle: "upload" });

  // updating works
  await setOptions({ deviceToken: "test" }, { storage });
  const newOpts = await getOptions({ storage });
  expect(newOpts).toEqual({
    ...defaultOptions,
    deviceToken: "test",
    outputStyle: "upload",
  });
});

test("default font name", () => {
  expect(defaultOptions.fontName).toBe("reMarkable Serif Small");
});

test("old trim device carries over", async () => {
  const storage = new MapStorage();
  storage.set({ pdfTrimDevice: "RM02A" });

  const opts = await getOptions({ storage });
  expect(opts.device).toBe("RM02A");
  expect(opts.trimPdf).toBe(true);

  // the old key is gone, so changing the device sticks
  await setOptions({ device: "RM110" }, { storage });
  const newOpts = await getOptions({ storage });
  expect(newOpts.device).toBe("RM110");
  expect(newOpts.trimPdf).toBe(true);
});

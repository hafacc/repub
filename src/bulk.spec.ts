import { expect, test } from "bun:test";
import {
  convertible,
  exportPage,
  exportPages,
  listable,
  type PageState,
  type PageTab,
} from "./bulk";
import { defaultOptions, type Options } from "./options";

const page: PageTab = {
  tabId: 1,
  title: "a page",
  url: "https://example.com/a-page",
  convertible: true,
};

type FakeEnv = NonNullable<Parameters<typeof exportPage>[4]>;

function fakeEnv(overrides: FakeEnv = {}): FakeEnv {
  return {
    wake: async () => {},
    capture: async () => new ArrayBuffer(4),
    convert: async () => ({ epub: new Uint8Array([1]), title: "parsed title" }),
    send: async () => {},
    save: async () => {},
    ...overrides,
  };
}

function collect(): [PageState[], (state: PageState) => void] {
  const states: PageState[] = [];
  return [
    states,
    (state) => {
      states.push(state);
    },
  ];
}

test("convertible", () => {
  expect(convertible("https://example.com")).toBe(true);
  expect(convertible("http://example.com")).toBe(true);
  expect(convertible("chrome://new-tab-page")).toBe(false);
  expect(convertible("file:///tmp/page.html")).toBe(false);
});

test("listable", () => {
  const tabs = [
    {
      id: 1,
      url: "https://example.com/one",
      title: "one",
      favIconUrl: "https://example.com/icon.png",
    },
    { id: 2, url: "chrome://new-tab-page", title: "New Tab" },
    { id: 3, url: "chrome-extension://repub/out/options.html", title: "mine" },
    { id: 4, url: "https://example.com/four" },
    { url: "https://example.com/no-id" },
  ] as chrome.tabs.Tab[];

  expect(listable(tabs, "chrome-extension://repub/")).toEqual([
    {
      tabId: 1,
      title: "one",
      url: "https://example.com/one",
      favIconUrl: "https://example.com/icon.png",
      convertible: true,
    },
    {
      tabId: 2,
      title: "New Tab",
      url: "chrome://new-tab-page",
      convertible: false,
    },
    {
      tabId: 4,
      title: "https://example.com/four",
      url: "https://example.com/four",
      convertible: true,
    },
  ]);
});

test("upload a page", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const sent: string[] = [];
  const woke: number[] = [];
  const [states, report] = collect();

  await exportPage(
    page,
    undefined,
    opts,
    report,
    fakeEnv({
      wake: async (tabId) => {
        woke.push(tabId);
      },
      send: async (_, title) => {
        sent.push(title);
      },
    }),
  );

  expect(woke).toEqual([1]);
  expect(sent).toEqual(["parsed title"]);
  expect(states).toEqual([
    { kind: "running", progress: 0.1 },
    { kind: "running", progress: 0.25 },
    { kind: "running", progress: 0.5 },
    { kind: "running", progress: 0.75 },
    { kind: "finished" },
  ]);
});

test("upload needs a token", async () => {
  const [states, report] = collect();
  await expect(
    exportPage(page, undefined, defaultOptions, report, fakeEnv()),
  ).rejects.toThrow("must be authenticated");
  expect(states).toEqual([]);
});

test("a filename doesn't retitle the epub", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const sent: string[] = [];
  const [, report] = collect();

  await exportPage(
    page,
    "what I call it",
    opts,
    report,
    fakeEnv({
      send: async (_, title) => {
        sent.push(title);
      },
    }),
  );

  expect(sent).toEqual(["parsed title"]);
});

test("download under the name given", async () => {
  const opts: Options = {
    ...defaultOptions,
    outputStyle: "download",
    downloadAsk: true,
  };
  const saved: [string, boolean][] = [];
  const [states, report] = collect();

  await exportPage(
    page,
    "my: page",
    opts,
    report,
    fakeEnv({
      save: async (_, filename, saveAs) => {
        saved.push([filename, saveAs]);
      },
    }),
  );

  expect(saved).toEqual([["my_ page.epub", false]]);
  expect(states.at(-1)).toEqual({ kind: "finished" });
});

test("download under the page's own title", async () => {
  const opts: Options = {
    ...defaultOptions,
    outputStyle: "download",
    downloadAsk: true,
  };
  const saved: [string, boolean][] = [];
  const [, report] = collect();

  // an emptied field asks for the file the same way no field at all would
  for (const name of [undefined, "   "]) {
    await exportPage(
      page,
      name,
      opts,
      report,
      fakeEnv({
        save: async (_, filename, saveAs) => {
          saved.push([filename, saveAs]);
        },
      }),
    );
  }

  expect(saved).toEqual([
    ["parsed title.epub", true],
    ["parsed title.epub", true],
  ]);
});

test("every page goes on its own", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const pages: PageTab[] = [page, { ...page, tabId: 2, title: "another page" }];
  const states = new Map<number, PageState>();

  await exportPages(
    pages,
    new Map(),
    opts,
    (tabId, state) => {
      states.set(tabId, state);
    },
    fakeEnv({
      capture: async (tabId) => {
        if (tabId === 2) throw new Error("no response");
        return new ArrayBuffer(4);
      },
    }),
  );

  expect(states.get(1)).toEqual({ kind: "finished" });
  expect(states.get(2)).toEqual({
    kind: "failed",
    error: "Error: no response",
  });
});

test("only a few pages go at a time", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const pages: PageTab[] = Array.from({ length: 9 }, (_, index) => ({
    ...page,
    tabId: index + 1,
  }));
  let held = 0;
  let most = 0;

  await exportPages(
    pages,
    new Map(),
    opts,
    () => {},
    fakeEnv({
      capture: async () => {
        held += 1;
        most = Math.max(most, held);
        await Bun.sleep(1);
        held -= 1;
        return new ArrayBuffer(4);
      },
    }),
  );

  expect(most).toBe(4);
});

test("nothing starts without a token to upload with", async () => {
  const states = new Map<number, PageState>();

  await exportPages(
    [page],
    new Map(),
    defaultOptions,
    (tabId, state) => {
      states.set(tabId, state);
    },
    fakeEnv(),
  );

  expect(states.get(1)).toEqual({
    kind: "failed",
    error: "Error: must be authenticated to upload documents to reMarkable",
  });
});

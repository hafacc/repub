import { expect, test } from "bun:test";
import {
  byWindow,
  convertible,
  exportPage,
  exportPages,
  listable,
  type PageState,
  type PageTab,
  preparePage,
  type Ready,
  stage,
} from "./bulk";
import { defaultOptions, type Options } from "./options";
import { within } from "./progress";

const page: PageTab = {
  tabId: 1,
  windowId: 1,
  title: "a page",
  url: "https://example.com/a-page",
  convertible: true,
};

type FakeEnv = NonNullable<Parameters<typeof exportPage>[4]>;

function fakeEnv(overrides: FakeEnv = {}): FakeEnv {
  return {
    wake: async () => {},
    capture: async () => new ArrayBuffer(4),
    read: async () => ({
      mhtml: new ArrayBuffer(4),
      title: "read title",
      author: "read author",
    }),
    convert: async (_, __, extra) => ({
      epub: new Uint8Array([1]),
      title: extra?.title ?? "parsed title",
    }),
    send: async () => {},
    save: async () => {},
    mark: async () => {},
    ...overrides,
  };
}

/** a page switched on with nothing typed for it and nothing read of it */
const bare: Ready = { title: "", author: "", tags: [] };

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
      windowId: 7,
      url: "https://example.com/one",
      title: "one",
      favIconUrl: "https://example.com/icon.png",
    },
    { id: 2, windowId: 7, url: "chrome://new-tab-page", title: "New Tab" },
    {
      id: 3,
      windowId: 7,
      url: "chrome-extension://repub/out/options.html",
      title: "mine",
    },
    { id: 4, windowId: 8, url: "https://example.com/four" },
    { windowId: 8, url: "https://example.com/no-id" },
  ] as chrome.tabs.Tab[];

  expect(listable(tabs, "chrome-extension://repub/")).toEqual([
    {
      tabId: 1,
      windowId: 7,
      title: "one",
      url: "https://example.com/one",
      favIconUrl: "https://example.com/icon.png",
      convertible: true,
    },
    {
      tabId: 2,
      windowId: 7,
      title: "New Tab",
      url: "chrome://new-tab-page",
      convertible: false,
    },
    {
      tabId: 4,
      windowId: 8,
      title: "https://example.com/four",
      url: "https://example.com/four",
      convertible: true,
    },
  ]);
});

test("windows come in the order they were opened", () => {
  const third = { ...page, tabId: 1, windowId: 3 };
  const first = { ...page, tabId: 2, windowId: 1 };
  const alsoThird = { ...page, tabId: 3, windowId: 3 };
  const second = { ...page, tabId: 4, windowId: 2 };
  const pages = [third, first, alsoThird, second];

  expect(byWindow(pages, 2)).toEqual([
    { windowId: 1, heading: "Window 1", pages: [first] },
    { windowId: 2, heading: "This window", pages: [second] },
    { windowId: 3, heading: "Window 3", pages: [third, alsoThird] },
  ]);
  // with no window of its own to go by, every window is numbered
  expect(byWindow(pages).map(({ heading }) => heading)).toEqual([
    "Window 1",
    "Window 2",
    "Window 3",
  ]);
});

test("upload a page", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const sent: string[] = [];
  const woke: number[] = [];
  const [states, report] = collect();

  await exportPage(
    page,
    bare,
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
    { kind: "running", ...within(stage.wake, 0) },
    { kind: "running", ...within(stage.capture, 0) },
    { kind: "running", ...within(stage.render, 0) },
    { kind: "running", ...within(stage.send, 0) },
    { kind: "finished" },
  ]);
});

test("a render reports its own progress", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const [states, report] = collect();

  await exportPage(
    page,
    bare,
    opts,
    report,
    fakeEnv({
      convert: async (_, __, extra) => {
        extra?.onProgress?.(0.5);
        return { epub: new Uint8Array([1]), title: "parsed title" };
      },
    }),
  );

  // half way through the render lands half way through the render's own share
  expect(states).toContainEqual({
    kind: "running",
    ...within(stage.render, 0.5),
  });
});

test("upload needs a token", async () => {
  const [states, report] = collect();
  await expect(
    exportPage(page, bare, defaultOptions, report, fakeEnv()),
  ).rejects.toThrow("must be authenticated");
  expect(states).toEqual([]);
});

test("the title typed is the one that goes out", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const sent: string[] = [];
  const titled: (string | undefined)[] = [];
  const [, report] = collect();

  await exportPage(
    page,
    { ...bare, title: "what I call it", author: "who wrote it" },
    opts,
    report,
    fakeEnv({
      convert: async (_, __, extra) => {
        titled.push(extra?.title, extra?.author);
        return { epub: new Uint8Array([1]), title: extra?.title };
      },
      send: async (_, title) => {
        sent.push(title);
      },
    }),
  );

  expect(titled).toEqual(["what I call it", "who wrote it"]);
  expect(sent).toEqual(["what I call it"]);
});

test("tags travel with the page they were set on", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token", tags: "x" };
  const sent: string[][] = [];
  const [, report] = collect();

  for (const tags of [["one", "two"], []]) {
    await exportPage(
      page,
      { ...bare, tags },
      opts,
      report,
      fakeEnv({
        send: async (_, __, ___, ____, extra) => {
          sent.push(extra.tags);
        },
      }),
    );
  }

  // an emptied field means no tags, not the saved ones
  expect(sent).toEqual([["one", "two"], []]);
});

test("download under the title typed", async () => {
  const opts: Options = {
    ...defaultOptions,
    outputStyle: "download",
    downloadAsk: true,
  };
  const saved: [string, boolean][] = [];
  const [states, report] = collect();

  await exportPage(
    page,
    { ...bare, title: "my: page" },
    opts,
    report,
    fakeEnv({
      save: async (_, filename, saveAs) => {
        saved.push([filename, saveAs]);
      },
    }),
  );

  expect(saved).toEqual([["my_ page.epub", true]]);
  expect(states.at(-1)).toEqual({ kind: "finished" });
});

test("download under the page's own title", async () => {
  const opts: Options = {
    ...defaultOptions,
    outputStyle: "download",
    downloadAsk: false,
  };
  const saved: [string, boolean][] = [];
  const [, report] = collect();

  // an emptied field asks for the page's own title
  for (const title of ["", "   "]) {
    await exportPage(
      page,
      { ...bare, title },
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
    ["parsed title.epub", false],
    ["parsed title.epub", false],
  ]);
});

test("a page read on the way in isn't read again", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const woke: number[] = [];
  const captured: number[] = [];
  const [states, report] = collect();

  await exportPage(
    page,
    { ...bare, mhtml: new ArrayBuffer(8) },
    opts,
    report,
    fakeEnv({
      wake: async (tabId) => {
        woke.push(tabId);
      },
      capture: async (tabId) => {
        captured.push(tabId);
        return new ArrayBuffer(4);
      },
    }),
  );

  expect(woke).toEqual([]);
  expect(captured).toEqual([]);
  // the ring starts where the reading left it, part way along
  expect(states).toEqual([
    { kind: "running", ...within(stage.render, 0) },
    { kind: "running", ...within(stage.send, 0) },
    { kind: "finished" },
  ]);
});

test("a page is woken before it's read", async () => {
  const woke: number[] = [];

  const read = await preparePage(page, defaultOptions, () => {}, {
    wake: async (tabId) => {
      woke.push(tabId);
    },
    read: async () => ({
      mhtml: new ArrayBuffer(4),
      title: "read title",
      author: "read author",
    }),
  });

  expect(woke).toEqual([1]);
  expect(read.title).toBe("read title");
  expect(read.author).toBe("read author");
});

test("every page goes on its own", async () => {
  const opts: Options = { ...defaultOptions, deviceToken: "token" };
  const pages: PageTab[] = [page, { ...page, tabId: 2, title: "another page" }];
  const states = new Map<number, PageState>();
  const marks = new Map<number, PageState>();

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
      mark: async (tabId, state) => {
        marks.set(tabId, state);
      },
    }),
  );

  expect(states.get(1)).toEqual({ kind: "finished" });
  expect(states.get(2)).toEqual({
    kind: "failed",
    error: "Error: no response",
  });
  // each tab's own icon says the same as its row
  expect(marks).toEqual(states);
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

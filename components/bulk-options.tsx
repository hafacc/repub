import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Input from "@mui/material/Input";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import {
  Fragment,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { FaGlobe, FaRegSquare } from "react-icons/fa6";
import {
  blocker,
  byWindow,
  exportPages,
  listable,
  type PageState,
  type PageTab,
  preparePage,
  type Ready,
} from "../src/bulk";
import type { Read } from "../src/details";
import { getOptions, type Options } from "../src/options";
import { reach } from "../src/progress";
import { knownTags } from "../src/tags";
import { errString, parseTags, TimedOut } from "../src/utils";
import TagField from "./tag-field";

/** what the list holds for one page that is switched on */
interface Row {
  /** the title for the document, or empty to keep the page's own */
  title: string;
  /** the author for the document, or empty to keep the page's own */
  author: string;
  /** the tags to upload the document under */
  tags: string[];
  /** the page as read when it was switched on, until it's sent */
  read?: Read;
  /** whether we're still reading the page */
  reading: boolean;
  /** whether the title or author is the reader's own, not the page's */
  touched?: boolean;
  /** what went wrong reading it, when something did */
  error?: string;
}

// the panel unmounts the moment another tab is picked, so what's chosen, what's
// typed, what's been read and what's still going are kept outside it
const panel = {
  version: 0,
  running: 0,
  selected: new Set<number>(),
  rows: new Map<number, Row>(),
  states: new Map<number, PageState>(),
  // the tags every page starts with, which the saved ones seed
  tags: [] as string[],
  seeded: false,
  listeners: new Set<() => void>(),
};

function change(edit: () => void): void {
  edit();
  panel.version += 1;
  for (const listener of panel.listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  panel.listeners.add(listener);
  return () => {
    panel.listeners.delete(listener);
  };
}

async function listPages(): Promise<PageTab[]> {
  const tabs = await chrome.tabs.query({});
  return listable(tabs, chrome.runtime.getURL(""));
}

/** which window the rows below it are open in, and a switch for all of them */
function WindowRow({
  windowId,
  heading,
  selected,
  total,
  running,
  onToggle,
}: {
  windowId: number;
  heading: string;
  // how many of the window's convertible tabs are switched on
  selected: number;
  // how many of its tabs can be converted at all
  total: number;
  running: boolean;
  onToggle: (windowId: number) => void;
}): ReactElement {
  const toggle = useCallback(() => {
    onToggle(windowId);
  }, [onToggle, windowId]);
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        pt: 4,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 500, flex: "1 1 auto", py: 0.5 }}
      >
        {heading}
      </Typography>
      {total ? (
        <Switch
          checked={selected === total}
          disabled={running}
          onChange={toggle}
          slotProps={{ input: { "aria-label": `select all in ${heading}` } }}
        />
      ) : null}
    </Box>
  );
}

/** the page's own icon, with a stand-in for a page that hasn't got one */
function Favicon({ page }: { page: PageTab }): ReactElement {
  const [broken, setBroken] = useState("");
  const fail = useCallback(() => {
    setBroken(page.favIconUrl ?? "");
  }, [page.favIconUrl]);
  if (page.favIconUrl && page.favIconUrl !== broken) {
    return (
      <img src={page.favIconUrl} alt="" width={16} height={16} onError={fail} />
    );
  } else {
    return (
      <Box sx={{ display: "flex", color: "rgba(0, 0, 0, 0.3)" }}>
        {page.convertible ? <FaGlobe /> : <FaRegSquare />}
      </Box>
    );
  }
}

// a step reports when it starts and then as it goes, so between reports the
// browser eases the ring on toward the end of the step; the long curve is
// front-loaded, which is why a slow step still looks like it's moving
const DRIFT = "6s cubic-bezier(0, 0.7, 0.25, 1)";
const SETTLE = "400ms cubic-bezier(0.4, 0, 0.2, 1)";

/** the page's icon, ringed by how far along its export is */
function PageIcon({
  page,
  state,
}: {
  page: PageTab;
  state: PageState | undefined;
}): ReactElement {
  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        flex: "none",
      }}
    >
      {state === undefined ? null : (
        <>
          <CircularProgress
            variant="determinate"
            value={100}
            size={28}
            thickness={4}
            sx={{ position: "absolute", color: "rgba(0, 0, 0, 0.12)" }}
          />
          <CircularProgress
            variant="determinate"
            value={state.kind === "running" ? reach(state) * 100 : 100}
            size={28}
            thickness={4}
            color={state.kind === "failed" ? "error" : "primary"}
            sx={{
              position: "absolute",
              "& circle": {
                transition: `stroke-dashoffset ${
                  state.kind === "running" ? DRIFT : SETTLE
                }`,
              },
            }}
          />
        </>
      )}
      <Favicon page={page} />
    </Box>
  );
}

/** the fields a page carries, in the line below its row */
function PageFields({
  page,
  row,
  upload,
  known,
  running,
  onEdit,
}: {
  page: PageTab;
  row: Row;
  // whether tags have anywhere to go, which only an upload gives them
  upload: boolean;
  known: readonly string[];
  running: boolean;
  onEdit: (tabId: number, change: Partial<Row>) => void;
}): ReactElement {
  const titleId = `title-${page.tabId.toFixed()}`;
  const authorId = `author-${page.tabId.toFixed()}`;
  const waiting = row.reading || running;
  return (
    <Box sx={{ display: "flex", gap: 1.5, pb: 2, pl: 5 }}>
      <Box sx={{ flex: "2.2 1 0", minWidth: 0 }}>
        <Typography
          variant="caption"
          component="label"
          color="textSecondary"
          htmlFor={titleId}
        >
          Title
        </Typography>
        <Input
          id={titleId}
          fullWidth
          value={row.title}
          disabled={waiting}
          placeholder={row.reading ? "" : "from the page"}
          onChange={(evt) => {
            onEdit(page.tabId, { title: evt.target.value });
          }}
        />
      </Box>
      <Box sx={{ flex: "1.4 1 0", minWidth: 0 }}>
        <Typography
          variant="caption"
          component="label"
          color="textSecondary"
          htmlFor={authorId}
        >
          Author
        </Typography>
        <Input
          id={authorId}
          fullWidth
          value={row.author}
          disabled={waiting}
          placeholder={row.reading ? "" : "from the page"}
          onChange={(evt) => {
            onEdit(page.tabId, { author: evt.target.value });
          }}
        />
      </Box>
      {upload ? (
        <Box sx={{ flex: "1.6 1 0", minWidth: 0 }}>
          <Typography variant="caption" component="div" color="textSecondary">
            Tags
          </Typography>
          <TagField
            id={`tags-${page.tabId.toFixed()}`}
            tags={row.tags}
            known={known}
            disabled={waiting}
            onChange={(picked) => {
              onEdit(page.tabId, { tags: picked });
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

/** one open tab: what it is, what to call it, and whether to convert it */
function PageRow({
  page,
  state,
  selected,
  row,
  upload,
  known,
  running,
  onToggle,
  onEdit,
}: {
  page: PageTab;
  state: PageState | undefined;
  selected: boolean;
  row: Row | undefined;
  upload: boolean;
  known: readonly string[];
  running: boolean;
  onToggle: (tabId: number) => void;
  onEdit: (tabId: number, change: Partial<Row>) => void;
}): ReactElement {
  const toggle = useCallback(() => {
    onToggle(page.tabId);
  }, [onToggle, page.tabId]);
  return (
    <Box
      sx={{
        borderBottom: "1px solid",
        borderColor: "rgba(0, 0, 0, 0.08)",
        opacity: page.convertible ? 1 : 0.45,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minHeight: "52px",
        }}
      >
        <PageIcon page={page} state={state} />
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {page.title}
          </Typography>
          <Typography
            variant="caption"
            component="div"
            color="textSecondary"
            noWrap
          >
            {page.url}
          </Typography>
        </Box>
        {state?.kind === "failed" ? (
          <Typography variant="caption" color="error" title={state.error}>
            failed
          </Typography>
        ) : page.convertible ? null : (
          <Typography variant="caption">can't be converted</Typography>
        )}
        <Switch
          checked={selected}
          disabled={running || !page.convertible}
          onChange={toggle}
          slotProps={{ input: { "aria-label": `convert ${page.title}` } }}
        />
      </Box>
      {selected && page.convertible && row ? (
        <PageFields
          page={page}
          row={row}
          upload={upload}
          known={known}
          running={running}
          onEdit={onEdit}
        />
      ) : null}
      {row?.error ? (
        <Typography
          variant="caption"
          color="error"
          component="div"
          sx={{ pb: 1, pl: 5 }}
        >
          {row.error}
        </Typography>
      ) : null}
    </Box>
  );
}

/** list every open tab and export the ones that are switched on */
export default function BulkOptions({
  opts,
}: {
  opts: Partial<Options>;
}): ReactElement {
  const { outputStyle } = opts;
  useSyncExternalStore(subscribe, () => panel.version);
  const [granted, setGranted] = useState<boolean | undefined>(undefined);
  const [pages, setPages] = useState<PageTab[]>([]);
  const [here, setHere] = useState<number | undefined>(undefined);
  const [known, setKnown] = useState<string[]>([]);
  const [error, setError] = useState("");
  const running = panel.running;
  const upload = outputStyle === "upload";

  useEffect(() => {
    const permissions = globalThis.chrome?.permissions;
    if (permissions) {
      permissions.contains({ permissions: ["tabs"] }).then(setGranted, () => {
        setGranted(false);
      });
    } else {
      setGranted(false);
    }
  }, []);

  useEffect(() => {
    if (!panel.seeded && opts.tags !== undefined) {
      change(() => {
        panel.tags = parseTags(opts.tags ?? "");
        panel.seeded = true;
      });
    }
  }, [opts.tags]);

  useEffect(() => {
    if (!upload) return;
    (async () => {
      const options = await getOptions();
      setKnown(await knownTags(options.deviceToken, options));
    })().catch((ex: unknown) => {
      console.warn("couldn't list the tablet's tags", ex);
    });
  }, [upload]);

  const reload = useCallback(() => {
    listPages().then(
      (listed) => {
        setPages(listed);
        setError("");
      },
      (ex: unknown) => {
        setError(errString(ex));
      },
    );
  }, []);

  const onTabs = useCallback(() => {
    // the list holds still while an export runs, so rows don't move under it
    if (!panel.running) {
      reload();
    }
  }, [reload]);

  useEffect(() => {
    globalThis.chrome?.windows?.getCurrent().then(
      ({ id }) => {
        setHere(id);
      },
      (ex: unknown) => {
        console.warn(ex);
      },
    );
  }, []);

  useEffect(() => {
    if (!granted) return;
    reload();
    chrome.tabs.onCreated.addListener(onTabs);
    chrome.tabs.onUpdated.addListener(onTabs);
    chrome.tabs.onRemoved.addListener(onTabs);
    chrome.tabs.onReplaced.addListener(onTabs);
    return () => {
      chrome.tabs.onCreated.removeListener(onTabs);
      chrome.tabs.onUpdated.removeListener(onTabs);
      chrome.tabs.onRemoved.removeListener(onTabs);
      chrome.tabs.onReplaced.removeListener(onTabs);
    };
  }, [granted, reload, onTabs]);

  const grant = useCallback(() => {
    chrome.permissions.request({ permissions: ["tabs"] }).then(
      (ok) => {
        setGranted(ok);
        if (!ok) {
          setError("rePub can't list your tabs without permission");
        }
      },
      (ex: unknown) => {
        setError(errString(ex));
      },
    );
  }, []);

  // reading a page on the way in is what fills its title and author, and
  // leaves the capture ready for the export
  const read = useCallback((page: PageTab) => {
    const held = panel.rows.get(page.tabId);
    if (held?.read) {
      change(() => {
        panel.rows.set(page.tabId, { ...held, reading: false });
      });
    } else {
      (async () => {
        const options = await getOptions();
        const got = await preparePage(page, options, (state) => {
          change(() => {
            panel.states.set(page.tabId, state);
          });
        });
        change(() => {
          panel.states.delete(page.tabId);
          const now = panel.rows.get(page.tabId);
          panel.rows.set(page.tabId, {
            title: now?.touched ? now.title : got.title,
            author: now?.touched ? now.author : got.author,
            tags: now?.tags ?? [...panel.tags],
            touched: now?.touched,
            read: got,
            reading: false,
          });
        });
      })().catch((ex: unknown) => {
        // a page that never loads can't be captured either, so it drops out
        // rather than waiting to fail again halfway through an export
        const stuck = ex instanceof TimedOut;
        const why = stuck ? "the page never finished loading" : errString(ex);
        change(() => {
          if (stuck) {
            panel.selected.delete(page.tabId);
            panel.states.set(page.tabId, { kind: "failed", error: why });
          } else {
            panel.states.delete(page.tabId);
          }
          const now = panel.rows.get(page.tabId);
          panel.rows.set(page.tabId, {
            title: now?.title ?? "",
            author: now?.author ?? "",
            tags: now?.tags ?? [...panel.tags],
            touched: now?.touched,
            reading: false,
            error: why,
          });
        });
      });
    }
  }, []);

  const switchOn = useCallback(
    (pick: readonly PageTab[]) => {
      change(() => {
        for (const page of pick) {
          panel.selected.add(page.tabId);
          const held = panel.rows.get(page.tabId);
          panel.rows.set(
            page.tabId,
            held ?? {
              title: "",
              author: "",
              tags: [...panel.tags],
              reading: true,
            },
          );
        }
      });
      for (const page of pick) {
        read(page);
      }
    },
    [read],
  );

  const toggle = useCallback(
    (tabId: number) => {
      const page = pages.find((listed) => listed.tabId === tabId);
      if (panel.selected.has(tabId) || !page) {
        change(() => {
          panel.selected.delete(tabId);
        });
      } else {
        switchOn([page]);
      }
    },
    [pages, switchOn],
  );

  const edit = useCallback((tabId: number, part: Partial<Row>) => {
    change(() => {
      const held = panel.rows.get(tabId);
      if (held) {
        const named = "title" in part || "author" in part;
        panel.rows.set(tabId, {
          ...held,
          ...part,
          touched: held.touched || named,
        });
      }
    });
  }, []);

  const onLoaded = useCallback(
    (tabId: number, info: chrome.tabs.OnUpdatedInfo) => {
      const row = panel.rows.get(tabId);
      if (
        info.status === "complete" &&
        row &&
        !row.reading &&
        !panel.running &&
        panel.selected.has(tabId)
      ) {
        const page = pages.find((listed) => listed.tabId === tabId);
        if (page) {
          change(() => {
            panel.rows.set(tabId, {
              ...row,
              read: undefined,
              reading: true,
              error: undefined,
            });
          });
          read(page);
        }
      }
    },
    [pages, read],
  );

  useEffect(() => {
    if (!granted) return;
    chrome.tabs.onUpdated.addListener(onLoaded);
    return () => {
      chrome.tabs.onUpdated.removeListener(onLoaded);
    };
  }, [granted, onLoaded]);

  const convertibles = pages.filter((page) => page.convertible);
  const chosen = convertibles.filter((page) => panel.selected.has(page.tabId));
  // a page still being read has no title yet, so there's nothing to send
  const waiting = chosen.some((page) => panel.rows.get(page.tabId)?.reading);

  const toggleAll = useCallback(() => {
    const every = convertibles.every((page) => panel.selected.has(page.tabId));
    if (every) {
      change(() => {
        panel.selected.clear();
      });
    } else {
      switchOn(convertibles);
    }
  }, [convertibles, switchOn]);

  const toggleWindow = useCallback(
    (windowId: number) => {
      const listed = convertibles.filter((page) => page.windowId === windowId);
      const every = listed.every((page) => panel.selected.has(page.tabId));
      if (every) {
        change(() => {
          for (const page of listed) {
            panel.selected.delete(page.tabId);
          }
        });
      } else {
        switchOn(listed);
      }
    },
    [convertibles, switchOn],
  );

  const start = useCallback(() => {
    change(() => {
      panel.running = chosen.length;
      panel.states.clear();
    });
    setError("");
    (async () => {
      const options = await getOptions();
      const stop = blocker(options);
      if (stop) {
        setError(stop);
        return;
      }
      const ready = new Map<number, Ready>(
        chosen.map((page) => {
          const row = panel.rows.get(page.tabId);
          return [
            page.tabId,
            {
              mhtml: row?.read?.mhtml,
              title: row?.title ?? "",
              author: row?.author ?? "",
              tags: row?.tags ?? [...panel.tags],
            },
          ];
        }),
      );
      await exportPages(chosen, ready, options, (tabId, state) => {
        change(() => {
          panel.states.set(tabId, state);
          // a page that went out switches itself off, so a second run doesn't
          // send it again, and lets go of what we read of it
          if (state.kind === "finished") {
            panel.selected.delete(tabId);
            panel.rows.delete(tabId);
          }
        });
      });
    })()
      .catch((ex: unknown) => {
        setError(errString(ex));
      })
      .finally(() => {
        change(() => {
          panel.running = 0;
        });
      });
  }, [chosen]);

  if (granted === undefined) {
    return <Stack />;
  } else if (!granted) {
    return (
      <Stack spacing={3}>
        <Typography variant="caption">
          Convert several open tabs at once. rePub needs permission to see your
          open tabs to list them here.
        </Typography>
        <Box>
          <Button variant="contained" onClick={grant}>
            Grant Tab Permissions
          </Button>
        </Box>
        {error ? (
          <Typography variant="caption" color="error">
            {error}
          </Typography>
        ) : null}
      </Stack>
    );
  } else {
    const windows = byWindow(pages, here);
    const verb = outputStyle === "download" ? "Download" : "Upload";
    const count = running || chosen.length;
    const noun = count === 1 ? "Tab" : "Tabs";
    return (
      <Stack>
        {convertibles.length ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, flex: "1 1 auto" }}
            >
              Select all
            </Typography>
            <Typography variant="caption">
              {`${chosen.length} selected`}
            </Typography>
            <Switch
              checked={chosen.length === convertibles.length}
              disabled={!!running}
              onChange={toggleAll}
              slotProps={{ input: { "aria-label": "select all" } }}
            />
          </Box>
        ) : (
          <Typography variant="caption">
            No open tabs can be converted.
          </Typography>
        )}
        {windows.map(({ windowId, heading, pages: listed }) => (
          <Fragment key={windowId}>
            {windows.length > 1 ? (
              <WindowRow
                windowId={windowId}
                heading={heading}
                selected={
                  listed.filter(
                    (page) =>
                      page.convertible && panel.selected.has(page.tabId),
                  ).length
                }
                total={listed.filter((page) => page.convertible).length}
                running={!!running}
                onToggle={toggleWindow}
              />
            ) : null}
            {listed.map((page) => (
              <PageRow
                key={page.tabId}
                page={page}
                state={panel.states.get(page.tabId)}
                selected={panel.selected.has(page.tabId)}
                row={panel.rows.get(page.tabId)}
                upload={upload}
                known={known}
                running={!!running}
                onToggle={toggle}
                onEdit={edit}
              />
            ))}
          </Fragment>
        ))}
        <Box sx={{ pt: 3 }}>
          <Button
            variant="contained"
            fullWidth
            disabled={!!running || !chosen.length || waiting}
            onClick={start}
          >
            {waiting
              ? `Reading ${count.toFixed()} ${noun}`
              : running
                ? `${verb}ing ${count.toFixed()} ${noun}`
                : `${verb} ${count.toFixed()} ${noun}`}
          </Button>
        </Box>
        {error ? (
          <Typography variant="caption" color="error" sx={{ pt: 1 }}>
            {error}
          </Typography>
        ) : null}
      </Stack>
    );
  }
}

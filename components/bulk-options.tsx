import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import OutlinedInput from "@mui/material/OutlinedInput";
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
} from "../src/bulk";
import { getOptions, type Options } from "../src/options";
import { errString, safeFilename } from "../src/utils";

// the panel unmounts the moment another tab is picked, so what's chosen, what's
// named and what's still going are kept outside it
const panel = {
  version: 0,
  running: 0,
  selected: new Set<number>(),
  names: new Map<number, string>(),
  states: new Map<number, PageState>(),
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

/** which window the rows below it are open in */
function WindowRow({ heading }: { heading: string }): ReactElement {
  return (
    <Typography
      variant="caption"
      sx={{
        pt: 2,
        pb: 0.5,
        fontWeight: 500,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      {heading}
    </Typography>
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
            value={state.kind === "running" ? state.progress * 100 : 100}
            size={28}
            thickness={4}
            color={state.kind === "failed" ? "error" : "primary"}
            sx={{ position: "absolute" }}
          />
        </>
      )}
      <Favicon page={page} />
    </Box>
  );
}

/** one open tab: what it is, what to call it, and whether to convert it */
function PageRow({
  page,
  state,
  selected,
  name,
  asking,
  running,
  onToggle,
  onName,
}: {
  page: PageTab;
  state: PageState | undefined;
  selected: boolean;
  name: string;
  // whether a filename is asked for here rather than in a save dialog
  asking: boolean;
  running: boolean;
  onToggle: (tabId: number) => void;
  onName: (tabId: number, name: string) => void;
}): ReactElement {
  const toggle = useCallback(() => {
    onToggle(page.tabId);
  }, [onToggle, page.tabId]);
  const rename = useCallback(
    (event: { target: { value: string } }) => {
      onName(page.tabId, event.target.value);
    },
    [onName, page.tabId],
  );
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        minHeight: "52px",
        borderBottom: "1px solid",
        borderColor: "rgba(0, 0, 0, 0.08)",
        opacity: page.convertible ? 1 : 0.45,
      }}
    >
      <PageIcon page={page} state={state} />
      <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {page.title}
        </Typography>
        <Typography variant="caption" component="div" noWrap>
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
      {asking && selected && page.convertible ? (
        <OutlinedInput
          size="small"
          value={name}
          onChange={rename}
          disabled={running}
          inputProps={{ "aria-label": `file name for ${page.title}` }}
          endAdornment={<InputAdornment position="end">.epub</InputAdornment>}
          sx={{ width: "210px", flex: "none", backgroundColor: "#fff" }}
        />
      ) : null}
      <Switch
        checked={selected}
        disabled={running || !page.convertible}
        onChange={toggle}
        slotProps={{ input: { "aria-label": `convert ${page.title}` } }}
      />
    </Box>
  );
}

/** list every open tab and export the ones that are switched on */
export default function BulkOptions({
  opts,
}: {
  opts: Partial<Options>;
}): ReactElement {
  const { outputStyle, downloadAsk } = opts;
  useSyncExternalStore(subscribe, () => panel.version);
  const [granted, setGranted] = useState<boolean | undefined>(undefined);
  const [pages, setPages] = useState<PageTab[]>([]);
  const [here, setHere] = useState<number | undefined>(undefined);
  const [error, setError] = useState("");
  const running = panel.running;

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

  const toggle = useCallback((tabId: number) => {
    change(() => {
      if (panel.selected.has(tabId)) {
        panel.selected.delete(tabId);
      } else {
        panel.selected.add(tabId);
      }
    });
  }, []);

  const rename = useCallback((tabId: number, name: string) => {
    change(() => {
      panel.names.set(tabId, name);
    });
  }, []);

  const convertibles = pages.filter((page) => page.convertible);
  const chosen = convertibles.filter((page) => panel.selected.has(page.tabId));
  const asking = outputStyle === "download" && !!downloadAsk;

  const toggleAll = useCallback(() => {
    change(() => {
      const every = convertibles.every((page) =>
        panel.selected.has(page.tabId),
      );
      panel.selected.clear();
      if (!every) {
        for (const page of convertibles) {
          panel.selected.add(page.tabId);
        }
      }
    });
  }, [convertibles]);

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
      const asked =
        options.outputStyle === "download" && options.downloadAsk
          ? chosen.map(
              (page) =>
                [
                  page.tabId,
                  panel.names.get(page.tabId) ?? safeFilename(page.title),
                ] as const,
            )
          : [];
      await exportPages(chosen, new Map(asked), options, (tabId, state) => {
        change(() => {
          panel.states.set(tabId, state);
          // a page that went out switches itself off, so a second run doesn't
          // send it again
          if (state.kind === "finished") {
            panel.selected.delete(tabId);
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
        <Typography variant="caption" sx={{ pb: 1.5 }}>
          Pages that aren't http or https can't be converted.
        </Typography>
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
            {windows.length > 1 ? <WindowRow heading={heading} /> : null}
            {listed.map((page) => (
              <PageRow
                key={page.tabId}
                page={page}
                state={panel.states.get(page.tabId)}
                selected={panel.selected.has(page.tabId)}
                name={panel.names.get(page.tabId) ?? safeFilename(page.title)}
                asking={asking}
                running={!!running}
                onToggle={toggle}
                onName={rename}
              />
            ))}
          </Fragment>
        ))}
        <Box sx={{ pt: 3 }}>
          <Button
            variant="contained"
            fullWidth
            disabled={!!running || !chosen.length}
            onClick={start}
          >
            {running
              ? `${verb}ing ${count} ${noun}`
              : `${verb} ${count} ${noun}`}
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

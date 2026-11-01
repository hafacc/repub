import "./popup.css";
import type {
  ConvertRequest,
  DetailsRequest,
  DetailsResponse,
} from "./messages";
import { getOptions } from "./options";
import { attachTagField, type TagField } from "./tag-field";
import { errString, parseTags } from "./utils";

const where = document.getElementById("where")! as HTMLSpanElement;
const bar = document.getElementById("bar")! as HTMLDivElement;
const title = document.getElementById("title-input")! as HTMLInputElement;
const author = document.getElementById("author-input")! as HTMLInputElement;
const tagsField = document.getElementById("tags-field")! as HTMLDivElement;
const tagHost = document.getElementById("tag-host")! as HTMLDivElement;
const button = document.getElementById("submit")! as HTMLButtonElement;
const error = document.getElementById("error")! as HTMLSpanElement;

/** the tab this popup is converting */
let tabId = -1;
/** whether tags have anywhere to go, which only an upload gives them */
let tagging = false;
/** the tags this document will carry */
let chosen: string[] = [];

const tags: TagField = attachTagField(tagHost, {
  id: "tag-input",
  onChange: (picked) => {
    chosen = picked;
  },
});

/** let the fields be typed in, or hold them while the page is being read */
function enable(on: boolean): void {
  bar.classList.toggle("busy", !on);
  for (const field of [title, author]) {
    field.disabled = !on;
  }
  tags.setDisabled(!on);
  button.disabled = !on;
}

function convert(): void {
  button.disabled = true;
  error.textContent = "";
  const msg: ConvertRequest = {
    type: "convert",
    tabId,
    title: title.value.trim() || undefined,
    author: author.value.trim() || undefined,
    tags: tagging ? chosen : undefined,
  };
  chrome.runtime.sendMessage(msg).then(
    () => {
      window.close();
    },
    (ex: unknown) => {
      error.textContent = `couldn't start the conversion: ${errString(ex)}`;
      button.disabled = false;
    },
  );
}

button.addEventListener("click", convert);

for (const field of [title, author]) {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !button.disabled) {
      event.preventDefault();
      convert();
    }
  });
}

/** the tab to convert, which a popup in its own window is told outright */
async function target(): Promise<number> {
  const given = new URLSearchParams(window.location.search).get("tab");
  if (given !== null) {
    return Number(given);
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const id = tab?.id;
    if (id === undefined) {
      throw new Error("couldn't tell which page to convert");
    } else {
      return id;
    }
  }
}

/**
 * lay the popup out, then fill it in
 *
 * The settings say how tall the popup is and what it says it will do, and
 * they're read first so that the page arriving later only ever fills fields
 * that are already there.
 */
async function start(): Promise<void> {
  tabId = await target();
  // the port keeps the worker up while the popup is open, and tells it when
  // the popup has gone
  chrome.runtime.connect({ name: `popup:${tabId.toFixed()}` });

  const options = await getOptions();
  tagging = options.outputStyle === "upload";
  where.textContent = tagging ? "upload to reMarkable" : "download as a file";
  tagsField.hidden = !tagging;
  chosen = tagging ? parseTags(options.tags) : [];
  tags.setTags(chosen);

  const request: DetailsRequest = { type: "details", tabId };
  const details = (await chrome.runtime.sendMessage(request)) as
    | DetailsResponse
    | undefined;
  if (details === undefined) {
    throw new Error("couldn't read the page");
  }
  if (details.error) {
    throw new Error(details.error);
  }

  title.value = details.title;
  author.value = details.author;
  tags.setKnown(details.known);
  enable(true);
  title.focus();
  title.select();
}

enable(false);

// a page we couldn't read is a page we couldn't convert, so the fields stay
// held and the button stays out
start().catch((ex: unknown) => {
  bar.classList.remove("busy");
  error.textContent = errString(ex);
});

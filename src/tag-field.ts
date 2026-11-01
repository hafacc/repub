import "./tag-field.css";

// how many of the tablet's tags the row offers at once
const OFFERED = 12;

/** a tag field that has been put in the page */
export interface TagField {
  /** put `tags` in the field */
  setTags: (tags: readonly string[]) => void;
  /** offer `known` as the tags that could be added */
  setKnown: (known: readonly string[]) => void;
  /** let the field be typed in, or hold it while something else is going on */
  setDisabled: (held: boolean) => void;
  /** take the field back out of the page */
  destroy: () => void;
}

/** the tags in `known` worth offering next, given what's chosen and typed */
export function offers(
  known: readonly string[],
  chosen: readonly string[],
  typed: string,
): { tags: string[]; fresh: boolean } {
  const needle = typed.toLowerCase();
  const matches = known
    .filter(
      (name) =>
        !chosen.includes(name) &&
        (!needle || name.toLowerCase().includes(needle)),
    )
    .slice(0, OFFERED);
  const fresh =
    !!typed &&
    !chosen.includes(typed) &&
    !known.some((name) => name.toLowerCase() === typed.toLowerCase());
  return { tags: fresh ? [typed, ...matches] : matches, fresh };
}

/**
 * put a tag field inside `host`
 *
 * The field is plain dom, so the popup and the options page get the same one
 * rather than one each. `onChange` is told every time the chosen tags change,
 * by typing, by clicking one of the offers, or by taking one back out.
 */
export function attachTagField(
  host: HTMLElement,
  { id, onChange }: { id?: string; onChange?: (tags: string[]) => void } = {},
): TagField {
  const box = document.createElement("div");
  box.className = "tag-box";
  const input = document.createElement("input");
  input.className = "tag-input";
  input.autocomplete = "off";
  if (id !== undefined) {
    input.id = id;
  }
  box.append(input);
  const row = document.createElement("div");
  row.className = "tag-offers";
  host.append(box, row);

  let chosen: string[] = [];
  let known: string[] = [];
  let offered: string[] = [];
  // which of the offers the keyboard is on, or -1 for none
  let active = -1;

  function showChips(): void {
    for (const chip of [...box.querySelectorAll(".tag-chip")]) {
      chip.remove();
    }
    for (const name of chosen) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.append(document.createTextNode(name));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `remove ${name}`);
      remove.addEventListener("click", () => {
        chosen = chosen.filter((tag) => tag !== name);
        changed();
        input.focus();
      });
      chip.append(remove);
      box.insertBefore(chip, input);
    }
    box.scrollLeft = box.scrollWidth;
  }

  function showOffers(): void {
    const { tags, fresh } = offers(known, chosen, input.value.trim());
    offered = tags;
    active = -1;
    row.replaceChildren();
    for (const [index, name] of offered.entries()) {
      const item = document.createElement("button");
      item.type = "button";
      item.disabled = input.disabled;
      item.textContent = fresh && !index ? `add “${name}”` : name;
      // the field loses focus before a click lands, so the tag is added early
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        addTag(name);
      });
      row.append(item);
    }
    row.scrollLeft = 0;
  }

  function changed(): void {
    showChips();
    showOffers();
    onChange?.([...chosen]);
  }

  function addTag(name: string): void {
    const tag = name.trim();
    if (tag && !chosen.includes(tag)) {
      chosen = [...chosen, tag];
    }
    input.value = "";
    changed();
  }

  function highlight(): void {
    for (const [index, item] of [...row.children].entries()) {
      item.classList.toggle("on", index === active);
      if (index === active) {
        item.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }

  const onInput = (): void => {
    showOffers();
  };
  const onFocus = (): void => {
    box.classList.add("focus");
  };
  const onBlur = (): void => {
    box.classList.remove("focus");
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(active >= 0 ? offered[active]! : input.value);
    } else if (event.key === "ArrowDown" && offered.length) {
      event.preventDefault();
      active = (active + 1) % offered.length;
      highlight();
    } else if (event.key === "ArrowUp" && offered.length) {
      event.preventDefault();
      active = (active <= 0 ? offered.length : active) - 1;
      highlight();
    } else if (
      event.key === "Backspace" &&
      !input.value.length &&
      chosen.length
    ) {
      chosen = chosen.slice(0, -1);
      changed();
    }
  };

  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", onKey);
  showOffers();

  return {
    setTags: (tags) => {
      chosen = [...tags];
      showChips();
      showOffers();
    },
    setKnown: (listed) => {
      known = [...listed];
      showOffers();
    },
    setDisabled: (held) => {
      input.disabled = held;
      box.classList.toggle("spent", held);
      for (const item of row.children) {
        (item as HTMLButtonElement).disabled = held;
      }
    },
    destroy: () => {
      box.remove();
      row.remove();
    },
  };
}

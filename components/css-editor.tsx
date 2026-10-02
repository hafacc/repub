import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { css as cssLanguage } from "@codemirror/lang-css";
import {
  bracketMatching,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter } from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type CssProblem, cssProblems, malformed } from "../src/css-check";

// how long typing has to stop before valid css is stored
const SAVE_DELAY = 500;
const MONO = '"Noto Mono", monospace';
// the page's own tint, so the generated half reads as part of the page rather
// than as text waiting to be typed in
const FROZEN_BACKGROUND = "#f4eee4";
const FROZEN_TEXT = "#8d8578";

const highlighting = HighlightStyle.define([
  { tag: tags.comment, color: "#8d8578", fontStyle: "italic" },
  {
    tag: [tags.tagName, tags.className, tags.typeName, tags.keyword],
    fontWeight: 600,
  },
  {
    tag: [tags.number, tags.unit, tags.string, tags.atom, tags.literal],
    color: "#6b6257",
  },
  { tag: tags.punctuation, color: "#9b9b9b" },
]);

const shared: Extension = [
  cssLanguage(),
  EditorView.lineWrapping,
  EditorView.theme({
    "&": { fontSize: "13px", color: "#000" },
    ".cm-scroller": {
      fontFamily: MONO,
      lineHeight: 1.6,
      // the editors grow to their contents and the box around them scrolls
      overflow: "visible",
    },
    ".cm-content": { padding: "12px 14px" },
    ".cm-line": { padding: 0 },
    "&.cm-focused": { outline: "none" },
  }),
];

const frozenExtensions: Extension = [
  shared,
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.theme({
    "&": { backgroundColor: FROZEN_BACKGROUND, color: FROZEN_TEXT },
    ".cm-content": { paddingBottom: "6px", caretColor: "transparent" },
  }),
];

const editableExtensions: Extension = [
  shared,
  syntaxHighlighting(highlighting),
  history(),
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    ...closeBracketsKeymap,
    ...completionKeymap,
  ]),
  closeBrackets(),
  autocompletion(),
  bracketMatching(),
  linter((view) =>
    cssProblems(view.state.doc.toString()).map(
      ({ from, to, severity, message }) => ({ from, to, severity, message }),
    ),
  ),
  EditorView.theme({
    "&": { backgroundColor: "#fff" },
    ".cm-content": { minHeight: "96px", paddingTop: "6px" },
  }),
];

function useEditor(
  extensions: Extension,
  onChange?: (text: string) => void,
): [(node: HTMLDivElement | null) => void, (text: string) => void] {
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  const mount = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        view.current = new EditorView({
          parent: node,
          extensions: [
            extensions,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                change.current?.(update.state.doc.toString());
              }
            }),
          ],
        });
      } else {
        view.current?.destroy();
        view.current = null;
      }
    },
    [extensions],
  );

  const setText = useCallback((text: string) => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== text) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: text },
      });
    }
  }, []);

  return [mount, setText];
}

function describe(text: string, { from, severity, message }: CssProblem) {
  const line = text.slice(0, from).split("\n").length;
  const prefix = severity === "error" ? "not saved, " : "";
  return `${prefix}line ${line}: ${message}`;
}

/**
 * the epub's stylesheet: what the options write, then the user's own rules
 *
 * The generated half is a second editor rather than part of the editable one,
 * so an edit can't reach it and it can be rewritten whenever an option changes.
 */
export default function CssEditor({
  generated,
  value,
  onChange,
}: {
  generated: string;
  value: string | undefined;
  onChange: (css: string) => void;
}): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);
  const stored = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edited = useCallback(
    (text: string) => {
      const problems = cssProblems(text);
      const worst =
        problems.find(({ severity }) => severity === "error") ?? problems[0];
      setProblem(worst ? describe(text, worst) : null);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      if (!malformed(problems) && text !== stored.current) {
        timer.current = setTimeout(() => {
          stored.current = text;
          onChange(text);
        }, SAVE_DELAY);
      }
    },
    [onChange],
  );

  const [mountFrozen, setFrozen] = useEditor(frozenExtensions);
  const [mountEditable, setEditable] = useEditor(editableExtensions, edited);

  // the generated half is the taller one, so the box opens on the rules that
  // can actually be edited
  const box = useRef<HTMLDivElement | null>(null);
  const toBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = box.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    setFrozen(generated);
    toBottom();
  }, [generated, setFrozen, toBottom]);

  useEffect(() => {
    if (value !== undefined && value !== stored.current) {
      stored.current = value;
      setEditable(value);
      toBottom();
    }
  }, [value, setEditable, toBottom]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return (
    <Box sx={{ pb: 1 }}>
      <Box
        ref={box}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "#fff",
          maxHeight: "420px",
          overflow: "auto",
        }}
      >
        <div ref={mountFrozen} />
        <div ref={mountEditable} />
      </Box>
      {/* held open so a problem doesn't move what's below it */}
      <Box sx={{ minHeight: "20px", pt: 0.5 }}>
        <Typography
          variant="caption"
          color={problem?.startsWith("not saved") ? "error" : "textSecondary"}
          sx={{ display: "block" }}
        >
          {problem}
        </Typography>
      </Box>
    </Box>
  );
}

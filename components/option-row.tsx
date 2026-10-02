import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import {
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";

// a warm tint rather than a rule, so nothing is drawn until the pointer is on
// the row; an open caption keeps it, to show which row it belongs to
const TINT = "#f4eee4";

/**
 * one option: what it's called, what sets it, and what it does on request
 *
 * Every option on the page is one of these, so whatever the control is, the
 * controls line up down the right edge and the captions stay out of the way
 * until they're wanted.
 */
export default function OptionRow({
  title,
  caption,
  control,
  collapsible = true,
}: {
  title: string;
  caption?: string;
  control: ReactNode;
  // for a row that's shown because of a choice just made, where the caption is
  // the reason it appeared
  collapsible?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const expandable = collapsible && caption !== undefined;
  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);
  // so setting the option doesn't also open its caption
  const keep = useCallback((evt: MouseEvent<HTMLElement>) => {
    evt.stopPropagation();
  }, []);
  return (
    <Box
      sx={{
        backgroundColor: open && expandable ? TINT : "transparent",
        transition: "background-color 120ms",
        ...(expandable ? { "&:hover": { backgroundColor: TINT } } : {}),
      }}
    >
      <Box
        onClick={expandable ? toggle : undefined}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          minHeight: "48px",
          py: 1,
          cursor: expandable ? "pointer" : "default",
        }}
      >
        <Box
          // held at its natural width so the controls line up, unless it
          // carries the caption too, when it gives way to wrap it
          sx={{ flexShrink: collapsible ? 0 : 1, minWidth: 0 }}
        >
          <Typography>{title}</Typography>
          {collapsible ? null : (
            <Typography variant="caption" sx={{ display: "block" }}>
              {caption}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            flexGrow: 1,
            flexShrink: 0,
            minWidth: 0,
            display: "flex",
            justifyContent: "flex-end",
            "& > *": { flexGrow: expandable ? 0 : 1 },
          }}
        >
          {expandable ? (
            // wrapped tightly, so the empty space beside the control still
            // belongs to the row and opens it
            <Box onClick={keep} sx={{ display: "flex", cursor: "default" }}>
              {control}
            </Box>
          ) : (
            control
          )}
        </Box>
        {expandable ? (
          // no handler of its own: the click it raises, by pointer or by
          // keyboard, is the one the row is already listening for
          <IconButton size="small" aria-label={title} aria-expanded={open}>
            {open ? <FaChevronUp /> : <FaChevronDown />}
          </IconButton>
        ) : null}
      </Box>
      {expandable ? (
        <Collapse in={open}>
          <Typography
            variant="caption"
            sx={{ display: "block", pb: 1.5, pr: 6 }}
          >
            {caption}
          </Typography>
        </Collapse>
      ) : null}
    </Box>
  );
}

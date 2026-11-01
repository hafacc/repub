import { createTheme } from "@mui/material/styles";
import {
  ALARM,
  FACE,
  INK,
  LABEL,
  LINE,
  PAPER,
  QUIET,
  RULE,
  SPENT,
} from "../src/tokens";

/**
 * the one theme the options page is drawn with
 *
 * It says the same things `tokens.css` says to the popup, so the two pages
 * can't drift apart: every tone and both faces come from `tokens.ts`.
 */
const theme = createTheme({
  palette: {
    primary: { main: "#000" },
    error: { main: ALARM },
    text: { primary: INK, secondary: QUIET, disabled: SPENT },
    background: { default: PAPER, paper: PAPER },
    divider: RULE,
  },
  shape: {
    borderRadius: 0,
  },
  // the scale mui ships is cut for Roboto: its steps are far apart and it
  // tracks the small sizes out, neither of which suits this face
  typography: {
    fontFamily: FACE,
    h4: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.015em" },
    h5: { fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.01em" },
    body1: { fontSize: "0.9375rem", lineHeight: 1.5, letterSpacing: 0 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5, letterSpacing: 0 },
    caption: { fontSize: "0.75rem", lineHeight: 1.45, letterSpacing: 0 },
    subtitle1: { letterSpacing: 0 },
    subtitle2: { letterSpacing: 0 },
    button: {
      fontSize: "0.8125rem",
      fontWeight: 500,
      letterSpacing: "0.045em",
    },
  },
  components: {
    // flat, and held back in the same tone the popup holds its button back in
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        contained: {
          "&.Mui-disabled": { backgroundColor: SPENT, color: "#fff" },
        },
      },
    },
    // text fields are a line under what's typed, the way the popup draws them
    MuiTextField: { defaultProps: { variant: "standard" } },
    MuiInput: {
      styleOverrides: {
        root: { fontSize: "0.8125rem" },
        underline: {
          "&::before": { borderBottom: `1px solid ${LINE}` },
          "&:hover:not(.Mui-disabled, .Mui-error)::before": {
            borderBottom: `1px solid ${LINE}`,
          },
          "&::after": { borderBottom: `2px solid ${INK}` },
        },
      },
    },
    MuiInputLabel: { styleOverrides: { root: { color: LABEL } } },
    // anything mui hangs off the end of the document is outside the page's own
    // styles, so it's told the face outright
    MuiPopover: { styleOverrides: { paper: { fontFamily: FACE } } },
    MuiMenu: { styleOverrides: { paper: { fontFamily: FACE } } },
    MuiTooltip: { styleOverrides: { tooltip: { fontFamily: FACE } } },
  },
});

export default theme;

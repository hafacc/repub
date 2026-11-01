/**
 * the tones and faces every surface of the extension is drawn with
 *
 * `tokens.css` says the same things as custom properties, for the stylesheets
 * that can't import this; `tokens.spec.ts` checks the two still agree.
 */

/** the tone every surface sits on */
export const PAPER = "rgb(250, 246, 240)";
/** body text */
export const INK = "#1a1a1a";
/** a label, or anything said beside the thing it names */
export const LABEL = "#4a443c";
/** text that is there to be read second */
export const QUIET = "#6b6257";
/** a control that can't be used yet */
export const SPENT = "#7d756a";
/** a line drawn around something */
export const RULE = "#cdbfa9";
/** the line under a field, until it's being typed in */
export const LINE = "rgba(0, 0, 0, 0.42)";
/** a chip, a menu row under the pointer, or anything lifted off the paper */
export const RAISED = "#ece3d6";
/** a row the pointer is on, or one holding itself open */
export const TINT = "#f4eee4";
/** something that went wrong */
export const ALARM = "#a8200f";
/** the face everything is set in */
export const FACE = "'Schibsted Grotesk', Helvetica, Arial, sans-serif";
/** the face anything typed as code is set in */
export const MONO = '"Noto Mono", monospace';
